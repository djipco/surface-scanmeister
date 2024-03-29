"""
vl6180x_multi module.

This module exposes a class allowing the creation and management of multiple VL6180x sensors on the
same I2C bus. By default, this is not possible since the devices all have the same address (0x29).
To circumvent that, the devices are assigned new addresses.

Thanks to Vitaly Grinberg for making the original code available under an MIT licence:
https://gitlab.com/vitus133/vl6180x_multi

Requirements:

    - Adafruit-Blinka==5.7.0
    - adafruit-circuitpython-busdevice==5.0.1
    - adafruit-circuitpython-lis3dh==5.1.5
    - adafruit-circuitpython-vl6180x==1.2.3
    - Adafruit-PlatformDetect==2.21.0
    - Adafruit-PureIO==1.1.7
    - colorzero==1.1
    - gpiozero==1.5.1
    - pigpio==1.78
    - pkg-resources==0.0.0
    - pyftdi==0.52.0
    - pyserial==3.5
    - pyusb==1.1.0
    - rpi-ws281x==4.2.5
    - RPi.GPIO==0.7.0
    - sysv-ipc==1.0.1

"""

# Standard imports
import time
import os
import json

# External imports
import board
import busio
import adafruit_vl6180x

try:
    import RPi.GPIO as GPIO
except RuntimeError:
    print("Error importing RPi.GPIO! Superuser privileges required!")

# CONSTANTS
SUBORDINATE_ADDR_REG = 0x212        # Register to change the device address
DEFAULT_SENSOR_ADDRESS = 0x29       # Default VL6180X I2C address (41)

# VL6180xSensorCollection class definition
class VL6180xSensorCollection():

    def __init__(self, ce_gpios: list, start_addr=None):

        try:

            # Initialize empty sensor list
            self.sensors = []

            # Assign channel list
            self.channels = ce_gpios

            # Assign I2C address for the first device
            if start_addr is not None and start_addr != DEFAULT_SENSOR_ADDRESS:
                self.start_addr = start_addr
            else:
                self.start_addr = DEFAULT_SENSOR_ADDRESS + 1

            # Use Broadcom SOC channel numbers for pin numbers. This is the number found beside GPIO
            # such as GPIO17 and NOT the pin numbers printed on the board.
            GPIO.setmode(GPIO.BCM)

            # Make all pins outputs and initially set them to low so we can reallocate their I2C
            # address before activating them.
            GPIO.setup(self.channels, GPIO.OUT)
            GPIO.output(self.channels, GPIO.LOW)

            # Reallocate I2C addresses
            self._realloc_addr()

        except Exception as e:
            print(e)
            exit(1)

    def _realloc_addr(self):

        # Create I2C bus and get a list of I2C addresses that cannot be used because they are
        # already in use.
        i2c = busio.I2C(board.SCL, board.SDA)
        busy_addr = i2c.scan()

        # To be on the safe side, we check if the default address (0x29) is in the found devices
        # list. This could be because a device could not be deactivated by setting the output to
        # GPIO.LOW.
        if DEFAULT_SENSOR_ADDRESS in busy_addr:
            raise RuntimeError(f"I2C address conflict, please check GPIO.")

        # Assign addresses by starting at start address and finding next available addresses
        next_addr = self.start_addr
        for channel in self.channels:

            while next_addr in busy_addr:
                next_addr += 1
                if next_addr > 127:
                    next_addr = 0
                if len(busy_addr) >= 128:
                    raise RuntimeError("Ran out of I2C addresses")

            busy_addr.append(next_addr)

            # Now that the new address is set, we can activate the sensor. As per the device
            # documentation, we need to wait at least 400μs after activation.
            GPIO.output(channel, GPIO.HIGH)
            time.sleep(0.1)

            # Because of the way the adafruit_vl6180x library works, we first need to create a dummy
            # device and assign it it's new address. Then, we can create the final sensor object and
            # the actual I2C address we want to use.
            temp = adafruit_vl6180x.VL6180X(i2c)
            temp._write_8(SUBORDINATE_ADDR_REG, next_addr)
            self.sensors.append(adafruit_vl6180x.VL6180X(i2c, address=next_addr))
