# Standard modules
import argparse
import signal
import sys
import time

# Import modules from Blinka
import adafruit_vl6180x

# Exteral imports
from pythonosc.udp_client import SimpleUDPClient

# Internal imports
# Docs: https://docs.circuitpython.org/projects/vl6180x/en/latest/api.html
from vl6180x_multi import VL6180xSensorCollection

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

# Create the sensor collection using the specified pins (in order). As far as I can tell, these are
# the pins that can be used (26 in total):
# collection = VL6180xSensorCollection([
#      0,  1,  4,  5,  6,  7,  8,  9, 10, 11,
#     12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
#     22, 23, 24, 25, 26, 27
# ])
collection = VL6180xSensorCollection(pins)



def signal_handler(signum, frame):
    signal.signal(signum, signal.SIG_IGN) # ignore additional signals
    cleanup() # give your process a chance to clean up
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler) # register the signal with the signal handler first

def cleanup():
    collection.destroy()

while True:

    for index, sensor in enumerate(collection.sensors):
        distance = collection.sensors[index].range
        luminosity = collection.sensors[index].read_lux(gain)
        client.send_message(f"/sensor/{index}/distance", distance) # in mm
        client.send_message(f"/sensor/{index}/luminosity", luminosity) # in lux

        print(distance, luminosity)

    # Wait a little before looping
    time.sleep(0.05) # Delay for 50 ms.
