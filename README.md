# INITIAL CONFIGURATION

### Operating System

These instructions apply to the Raspberry Pi OS version targeting Debian 12 ("bookworm").

* Use **Raspberry Pi Imager.app** to create brand new SDHC boot medium for the Raspberry Pi. During the
  process click on "Modify Settings":
  
  * Host: **scanmeister0x** (change "x" by integer)
  * User account: **scanmeister**
  * Password: use a 6-character random password (write it on device)

* Boot Pi from the SDHC card and connect to network

* Go to Pi config:
  
  * Enable **VNC** and **SSH** (in "Interfaces" section)
  * Set timezone (in "Localisation" section)
    
* Update everything:

  ```sh
  sudo apt update
  sudo apt upgrade -y
  ```

### Node.js

Install Node.js. Step 1, add the source for Node's latest LTS version:

```sh
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
```

Step 2, install Node.js:

```sh
sudo apt install -y nodejs
```

### Scanmeister

#### Prerequisite

The distance sensors used by `scanmeister` rely on the I2C protocol. Therefore, I2C must be 
enabled on the Pi:

  * Preferences -> Raspberry Pi Configuration -> Interfaces
  * Enable I2C
  * Reboot

#### Installation

To install `scanmeister`, open a terminal, go to desktop and clone from repo:

```sh
cd ~/Desktop
git clone https://github.com/djipco/surface-scanmeister
```

Once the repo is cloned, go inside folder and install all modules:

```sh
cd surface-scanmeister
npm install
```

#### Python

Python libraries are used to talk to the distance sensors and send the info to the remote. To 
install Python libraries in recent versions of the Raspberry Pi OS, you must first create a virtual 
Python environment. 

Go to root of project, create virtual environment in `env` folder and activate it:

```sh
cd /path/to/surface-scanmeister
python3 -m venv env --system-site-packages
source env/bin/activate
```

Then we need to install [Blinka]([url](https://learn.adafruit.com/circuitpython-on-raspberrypi-linux/installing-circuitpython-on-raspberry-pi)).
It is is a framework created by Adafruit and is used by the sensor library. This script does 
everything automatically:

```
pip3 install --upgrade adafruit-python-shell
wget https://raw.githubusercontent.com/adafruit/Raspberry-Pi-Installer-Scripts/master/raspi-blinka.py
sudo -E env PATH=$PATH python3 raspi-blinka.py
```

Finally, we need to install the `adafruit-circuitpython-vl6180x` and `python-osc` libraries:

```
pip install adafruit-circuitpython-vl6180x
pip install python-osc
```

Note: if you need to get out of the virtual Python environment, simply call `deactivate`.

**Additional note**: it seems that the `RPi.GPIO` module does not work on Pi 5 due to hardware changes. 
So we need to do the following in order to install a drop-in replacement (in the virtual env):

```
sudo apt remove python3-rpi.gpio
pip3 install rpi-lgpio
```

#### Start At Boot

To configure ScanMeister to automatically start at boot, copy the `config/scanmeister.service` file
to `/etc/systemd/system/scanmeister.service`.

Once the file is in place, issue the following command to tell `systemd` it exists:

```sh
sudo systemctl daemon-reload
```

To make ScanMeister automatically start on boot:

```sh
sudo systemctl enable scanmeister.service
```

You can also stop it from starting on boot with:

```sh
sudo systemctl disable scanmeister.service
```

To manually start or stop it:

```sh
sudo systemctl start scanmeister.service
sudo systemctl stop scanmeister.service
```

To check if the application is running properly or to see if any error messages have been 
triggered:

```sh
sudo systemctl status scanmeister.service
```

#### Configuration

By default, the **HTTP API** of ScanMeister listens on port **`5678`**, the **HTTP file** server
listens on port **`8080`** and the **OSC server** listens on port **`8000`**. 

To change the IP address and port of the machine OSC messages are sent to, you can modify the 
configuration file:

  ```surface-scanmeister/config/config.js```

This same file can be modified to specify which port the OSC server listens on (by default, 
`8000`). The IP address of the machine OSC messages are sent to should be changed.

The configuration file can also be used to specify the mapping to use for various hubs and
scanner configuration. The `devices.mapping` parameter is used for that and points to one 
of the configuration from the `surface-scanmeister/config/ScannerMappings.js` file.

To reload the configuration file, simply stop and start the `scanmeister` service:

```sh
sudo systemctl stop scanmeister.service
sudo systemctl start scanmeister.service
```

#### Manual Launch

Typically, `scanmeister` is started at boot by `systemctl`. You can also start it manually by 
double-clicking on the `ScanMeister` icon found in the project folder.

    You can deactivate the annoying "Execute File" prompt by opening the File Manager and going to 
    Edit -> Preferences -> General and checking the option that says "Don't ask options on launch 
    executable file".

You can also issue the following command in a Terminal from inside the `surface-scanmeister` 
directory:

```sh
node ScanMeister.js
```

# Remote Access

* **VNC**: use `scanmeister` (username) and the password defined above.

* **ssh**: `ssh@IP_ADDRESS` (with same user and pass)

# OSC Schema

On startup and shutdown, the system sends this OSC message:

* `/system/status i 0 (or 1)`

# Testing the scanning environment

#### scanimage

The `scanimage` command is what is used under the hood to control the scanners. 
You can user is to list available devices:

```sh
scanimage --list-devices
```

Results:

```
device `genesys:libusb:001:009' is a Canon LiDE 210 flatbed scanner
device `genesys:libusb:001:008' is a Canon LiDE 210 flatbed scanner
```

or

```sh
scanimage -L
```

There is a [list of supported scanners](http://www.sane-project.org/sane-mfgs.html#SCANNERS) on the 
SANE website.

If, for whatever reason, `scanimage` is not installed (it should already be installed, you need to
install SANE:

```sh
sudo apt install sane
```

#### Retrieve options for device (the options vary from device to device)

```sh
scanimage --device-name='genesys:libusb:001:008' --help 
```

or

```sh
scanimage --device-name='genesys:libusb:001:008' --all-options
```

Result:

```
Options specific to device 'genesys:libusb:001:008':
  Scan Mode:
    --mode Color|Gray [Gray]
        Selects the scan mode (e.g., lineart, monochrome, or color).
    --source Flatbed [Flatbed]
        Selects the scan source (such as a document-feeder).
    --preview[=(yes|no)] [no]
        Request a preview-quality scan.
    --depth 16|8 [8]
        Number of bits per sample, typical values are 1 for "line-art" and 8
        for multibit scans.
    --resolution 4800|2400|1200|600|300|150|100|75dpi [75]
        Sets the resolution of the scanned image.
  Geometry:
    -l 0..216.7mm [0]
        Top-left x position of scan area.
    -t 0..297.5mm [0]
        Top-left y position of scan area.
    -x 0..216.7mm [216.7]
        Width of scan-area.
    -y 0..297.5mm [297.5]
        Height of scan-area.
  Enhancement:
    --custom-gamma[=(yes|no)] [no]
        Determines whether a builtin or a custom gamma-table should be used.
    --gamma-table 0..65535,... [inactive]
        Gamma-correction table.  In color mode this option equally affects the
        red, green, and blue channels simultaneously (i.e., it is an intensity
        gamma table).
    --red-gamma-table 0..65535,... [inactive]
        Gamma-correction table for the red band.
    --green-gamma-table 0..65535,... [inactive]
        Gamma-correction table for the green band.
    --blue-gamma-table 0..65535,... [inactive]
        Gamma-correction table for the blue band.
    --brightness -100..100 (in steps of 1) [0]
        Controls the brightness of the acquired image.
    --contrast -100..100 (in steps of 1) [0]
        Controls the contrast of the acquired image.
  Extras:
    --lamp-off-time 0..60 [15]
        The lamp will be turned off after the given time (in minutes). A value
        of 0 means, that the lamp won't be turned off.
    --lamp-off-scan[=(yes|no)] [no]
        The lamp will be turned off during scan. 
    --color-filter Red|Green|Blue [Green]
        When using gray or lineart this option selects the used color.
    --calibration-file <string> []
        Specify the calibration file to use
    --expiration-time -1..30000 (in steps of 1) [60]
        Time (in minutes) before a cached calibration expires. A value of 0
        means cache is not used. A negative value means cache never expires.
```

#### Debugging

You can debug scanimage by prepending the command with environment variables:

```
SANE_DEBUG_DLL=255
SANE_DEBUG_HPAIO=255
SANE_DEBUG_SANEI_TCP=255
```

For example:

```
SANE_DEBUG_DLL=255 scanimage --device-name=genesys:libusb:001:072 --format=png --mode=Color --output-file=test.png
```

More details on debugging here: https://docs.fedoraproject.org/en-US/quick-docs/cups-debug-scanning-issues/


#### Perform a manual scan

This will save the file on the disk as `image.png`

```sh
scanimage \
  --device-name='genesys:libusb:001:008' \
  --format=png \
  --mode=Color \
  --depth=8 \
  --resolution=100 \
  --brightness=0 \
  --contrast=0 \
  --lamp-off-scan=no \
  --output-file='image.png'
```

#### Send data to TD over TCP

To quickly test the system, it is possible to pipe the output of `scanimage` into `nc` in order to 
send it to TouchDesigner over a TCP connection:

```scanimage --format=pnm --mode=Color | nc -q 0 10.0.0.200 1234```

In this scenario, the image will appear in TD in the `image0` component. The format **must be** `pnm` and 
the mode **must be** `Color`. This yiels a PNM in the P6 format.

    Warning: you may have to isntall netcat. On Debian "Bookworm" (12), I had to use: `sudo apt install netcat-traditional`

The **scanmeister** daemon running on the Pi does the same thing behind the scene. To identify which
device the image is coming from, **scanmeister** adds a comment on the first line of the output. This
is why images sent by **scanmeister** are properly indexed from 1 to 16 (matching the channel).

## USB Devices & USB Physical Ports

USB devices are listed in `/dev/bus/usb`. You can also list them with:

```shell
lsusb
```

Hierachical view (tree view):

```shell
lsusb -t
```

`scanimage` does not provide physical port information. This information can be fetched with 
`usb-devices` (also installed by default). This is what the code uses to figure which device is on 
which port:

```
usb-devices
```
