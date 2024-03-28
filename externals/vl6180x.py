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

# Create I2C bus and sensor instance
i2c = busio.I2C(board.SCL, board.SDA)
# sensor = adafruit_vl6180x.VL6180X(i2c)

# print(board.SCL, board.SDA)
print(board.board_id)
print(get_unique_pins())


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







def is_hardware_I2C(scl, sda):
    try:
        p = busio.I2C(scl, sda)
        p.deinit()
        return True
    except ValueError:
        return False
    except RuntimeError:
        return True


def get_unique_pins():
    exclude = ['NEOPIXEL', 'APA102_MOSI', 'APA102_SCK']
    pins = [pin for pin in [
        getattr(board, p) for p in dir(board) if p not in exclude]
            if isinstance(pin, Pin)]
    unique = []
    for p in pins:
        if p not in unique:
            unique.append(p)
    return unique


for scl_pin in get_unique_pins():
    for sda_pin in get_unique_pins():
        if scl_pin is sda_pin:
            continue
        if is_hardware_I2C(scl_pin, sda_pin):
            print("SCL pin:", scl_pin, "\t SDA pin:", sda_pin)
