# Standard modules
import argparse
import time

# Import modules from Blinka
import adafruit_vl6180x
# import board
# import busio

# Exteral imports
from pythonosc.udp_client import SimpleUDPClient

# Internal imports
from vl6180x_multi import VL6180xSensorCollection



# Configuration
# MULTIPLEXER_ADDRESS = 0x70  # Address of the TCA9548A multiplexer

# Variables
# channel = 0                 # currently selected channel


# Construct the argument parser and configure available arguments
ap = argparse.ArgumentParser()
ap.add_argument("-i", "--ip", default="127.0.0.1", help="IP address of the OSC target.")
ap.add_argument("-p", "--port", default=10000, type=int, help="Port of the OSC target.")
ap.add_argument("-g", "--gain", default="1", help="Gain to apply to luminosity [1, 1.25, 1.67, 2.5, 5, 10, 20, 40]")
ap.add_argument("-n", "--pins", default="1", help="GPIO pin numbers where the sensors are connected (comma-separated).")
args = ap.parse_args()

# Parse pin numbers into list
pins = [int(item) for item in args.pins.split(',')]
print("pins", pins)

# Parse luminosity gain according to following constants:
#   - adafruit_vl6180x.ALS_GAIN_1       = 1x        # 6
#   - adafruit_vl6180x.ALS_GAIN_1_25    = 1.25x     # 5
#   - adafruit_vl6180x.ALS_GAIN_1_67    = 1.67x     # 4
#   - adafruit_vl6180x.ALS_GAIN_2_5     = 2.5x      # 3
#   - adafruit_vl6180x.ALS_GAIN_5       = 5x        # 2
#   - adafruit_vl6180x.ALS_GAIN_10      = 10x       # 1
#   - adafruit_vl6180x.ALS_GAIN_20      = 20x       # 0
#   - adafruit_vl6180x.ALS_GAIN_40      = 40x       # 7
gain = getattr(adafruit_vl6180x, "ALS_GAIN_" + args.gain.replace(".", "_", 1))

# Create OSC client
client = SimpleUDPClient(args.ip, args.port)  # Create client


# i2c = busio.I2C(board.SCL, board.SDA)

# Create the sensor collection using the specified pins (in order). As far as I can tell, these are
# the pins that can be used (26 in total):
#   00, 01, 04, 05, 06, 07, 08, 09, 10, 11,
#   12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
#   22, 23, 24, 25, 26, 27
collection = VL6180xSensorCollection(pins)
# collection = VL6180xSensorCollection([
#      0,  1,  4,  5,  6,  7,  8,  9, 10, 11,
#     12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
#     22, 23, 24, 25, 26, 27
# ])


# sensor = adafruit_vl6180x.VL6180X(i2c)    # Hardware id is 0x29 (41)


while True:

    for index, sensor in enumerate(collection.sensors):
        distance = collection.sensors[index].range
        luminosity = collection.sensors[index].read_lux(gain)
#         client.send_message(f"/sensor/{index}/distance", distance)
#         client.send_message(f"/sensor/{index}/luminosity", luminosity)
        print(distance, luminosity)


    # Select channel on multiplexer
    # multiplexer_select(i2c, channel)
    # channel += 1
    # if channel > 7: channel = 0

    # Get distance and luminosity from the VL6180X device (0x29) on currently selected multiplexer
    # channel (using defined gain level)
#     distance = sensor.range
#     luminosity = sensor.read_lux(gain)

    # Send data via OSC
#     client.send_message(f"/sensor/{channel}/distance", distance) # in mm
#     client.send_message(f"/sensor/{channel}/luminosity", luminosity) # in lux
#     client.send_message(f"/sensor/{channel}/distance", 123)
#     client.send_message(f"/sensor/{channel}/luminosity", 45)




    # Wait a little before looping
    time.sleep(0.1) # Delay for 100 ms.


# def multiplexer_select(i2c, channel):
#     if (channel > 7): return
#     i2c.writeto(MULTIPLEXER_ADDRESS, 1 << channel)

# Arduino example code:
# void tcaselect(uint8_t i) {
#   if (i > 7) return;
#
#   Wire.beginTransmission(TCAADDR);
#   Wire.write(1 << i);
#   Wire.endTransmission();
# }


