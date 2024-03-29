"""Multisensor main module.

This module implements a class for managing multiple identical I2C devices of the same type using
the same I2C bus. The solution is to reallocate them to the different addresses while taking them
out of reset one by one.

https://gitlab.com/vitus133/vl6180x_multi

"""

import time
import os
import json

import board
import busio
import adafruit_vl6180x

try:
    import RPi.GPIO as GPIO
except RuntimeError:
    print("Error importing RPi.GPIO! Superuser privileges required!")

""" Register for changing the device bus address """
SUBORDINATE_ADDR_REG = 0x212

""" Default address sensor gets out of reset with """
DEFAULT_SENSOR_ADDRESS = 41


class MultiSensor():

    def __init__(self, ce_gpios: list, start_addr=None):

        try:
            self.sensors = []
            if start_addr is not None and start_addr != DEFAULT_SENSOR_ADDRESS:
                self.start_addr = start_addr
            else:
                self.start_addr = DEFAULT_SENSOR_ADDRESS + 1

            GPIO.setmode(GPIO.BCM)
            self.channels = ce_gpios
            GPIO.setup(self.channels, GPIO.OUT)
            GPIO.output(self.channels, GPIO.LOW)
            self._realloc_addr()

        except Exception as e:
            print(e)
            exit(1)

    def _realloc_addr(self):
        """ Reallocate default I2C addresses
        All the sensors are now shut down (done in the constructor)
        Turn them on one by one and reassign to another address
        """
        i2c = busio.I2C(board.SCL, board.SDA)
        busy_addr = i2c.scan()
        # Default address is 41 (0x29). This is the address our sensors get out of reset.
        if DEFAULT_SENSOR_ADDRESS in busy_addr:
            raise RuntimeError(f"I2C address conflict, please check GPIO")
        next_addr = self.start_addr
        for channel in self.channels:
            # find next unoccupied address
            while next_addr in busy_addr:
                next_addr += 1
                if next_addr > 127:
                    next_addr = 0
                if len(busy_addr) >= 128:
                    raise RuntimeError("Ran out of I2C addresses")
            # Allocate the next address to the sensor
            busy_addr.append(next_addr)

            # Turn on the sensor
            GPIO.output(channel, GPIO.HIGH)

            # Hitting an error without this delay
            # Adafruit_PureIO/smbus.py", line 308, in write_bytes
            # self._device.write(buf) OSError:
            # [Errno 121] Remote I/O error
            time.sleep(0.1)

            # Instantiate as temporary
            temp = adafruit_vl6180x.VL6180X(i2c)

            # Change the address to the assigned one
            temp._write_8(SUBORDINATE_ADDR_REG, next_addr)

            # Instantiate the sensor with the new address
            self.sensors.append(adafruit_vl6180x.VL6180X(i2c, address=next_addr))
