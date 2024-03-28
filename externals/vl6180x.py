import time
import board
import busio
import argparse

# import adafruit_vl6180x
from pythonosc.udp_client import SimpleUDPClient


# Construct the argument parser and add arguments
ap = argparse.ArgumentParser()
ap.add_argument("-i", "--ip", help="IP address of the OSC target")
ap.add_argument("-p", "--port", type=int, help="Port of the OSC target")
args = ap.parse_args()

print(args)




# OSC address and port MAKE IT SO WE CAN PASS THEM ON THE COMMAND LINE!!!
# ip = "10.0.0.200"
# port = 10000
# client = SimpleUDPClient(ip, port)  # Create client

# Create I2C bus and sensor instance
# i2c = busio.I2C(board.SCL, board.SDA)
# sensor = adafruit_vl6180x.VL6180X(i2c)

# Static properties for luminosity gain:
#   - adafruit_vl6180x.ALS_GAIN_1       = 1x
#   - adafruit_vl6180x.ALS_GAIN_1_25    = 1.25x
#   - adafruit_vl6180x.ALS_GAIN_1_67    = 1.67x
#   - adafruit_vl6180x.ALS_GAIN_2_5     = 2.5x
#   - adafruit_vl6180x.ALS_GAIN_5       = 5x
#   - adafruit_vl6180x.ALS_GAIN_10      = 10x
#   - adafruit_vl6180x.ALS_GAIN_20      = 20x
#   - adafruit_vl6180x.ALS_GAIN_40      = 40x

while True:

    # Get distance and luminosity
#     distance = sensor.range
#     luminosity = sensor.read_lux(adafruit_vl6180x.ALS_GAIN_1)

    # Print distance and luminosity to STDOUT
    # print("{0}:{1}".format(distance, luminosity))

    # Send data via OSC
#     client.send_message("/sensor/1/distance", distance)
#     client.send_message("/sensor/1/luminosity", distance)
    client.send_message("/sensor/1/distance", 123)
    client.send_message("/sensor/1/luminosity", 56)

    # Wait a little before looping
    time.sleep(0.1) # Delay for a 100 ms.
