# Import standard modules
import argparse

# Import modules from Blinka
import adafruit_vl6180x
import board
import busio
import microcontroller
import time
from microcontroller import Pin

# Import OSC
from pythonosc.udp_client import SimpleUDPClient

# Construct the argument parser and configure available arguments
ap = argparse.ArgumentParser()
ap.add_argument("-c", "--scl", default=3, type=int, help="SCL (clock wire) pin number")
ap.add_argument("-d", "--sda", default=2, type=int, help="SDA (data wire) pin number")

ap.add_argument("-i", "--ip", default="127.0.0.1", help="IP address of the OSC target")
ap.add_argument("-p", "--port", default=10000, type=int, help="Port of the OSC target")
ap.add_argument("-g", "--gain", default="1", help="Gain to apply to luminosity [1, 1.25, 1.67, 2.5, 5, 10, 20, 40]")
args = ap.parse_args()

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

# Create I2C bus and sensor instance using specific pins. By default, SCL is (4, 3) and SDA is
# (4, 2). Other available pins on Pi 5 are:
#
#       (4, 8), (4, 7), (4, 0), (4, 1), (4, 10), (4, 11), (4, 12), (4, 13), (4, 14), (4, 15),
#       (4, 16), (4, 17), (4, 18), (4, 19), (4, 2), (4, 20), (4, 21), (4, 22), (4, 23), (4, 24),
#       (4, 25), (4, 26), (4, 27), (4, 3), (4, 4), (4, 5), (4, 6), (4, 9)
i2c = busio.I2C((4, args.scl), (4, args.sda))
# i2c = busio.I2C(board.SCL, board.SDA)
# print(i2c.scan())
# sensor = adafruit_vl6180x.VL6180X(i2c)    # Hardware id is 0x29 (41)

# print(board.SCL, board.SDA)
print(board.board_id)






# print(
#     getattr(adafruit_vl6180x, "ALS_GAIN_1")
#     adafruit_vl6180x.ALS_GAIN_1_25,
#     adafruit_vl6180x.ALS_GAIN_1_67,
#     adafruit_vl6180x.ALS_GAIN_2_5,
#     adafruit_vl6180x.ALS_GAIN_5,
#     adafruit_vl6180x.ALS_GAIN_10,
#     adafruit_vl6180x.ALS_GAIN_20,
#     adafruit_vl6180x.ALS_GAIN_40
# )

while True:

    # Get distance and luminosity
#     distance = sensor.range
#     luminosity = sensor.read_lux(gain)

    # Send data via OSC
#     client.send_message("/sensor/1/distance", distance)
#     client.send_message("/sensor/1/luminosity", distance)
    client.send_message("/sensor/1/distance", 123)
    client.send_message("/sensor/1/luminosity", 56)

    # Wait a little before looping
    time.sleep(0.1) # Delay for a 100 ms.







