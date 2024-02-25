# INITIAL CONFIGURATION

### Raspbian

* Use **Raspberry Pi Imager.app** to create brand new SDHC boot medium for the Raspberry Pi. In the software,
* click on "Modify Settings" and:
  * Name host to: **scanmeister0x** (change "x" by integer)
  * Create user account named **scanmeister** (you must specify it but we will remove it later)
* Boot Pi from the SDHC card and connect to network
* Go to Pi config:
  * Enable VNC (in "Interfaces" section)
  * Set timezone (in "Localisation" section)  
* Update everything:

  ```
  sudo apt update
  sudo apt upgrade -y
  ```

### Node.js

`scanmeister` needs Node.js to be installed. First, we need to add the source for Node's latest LTS version:

```
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
```

Then, we can install Node.js and `npm`:

```
sudo apt install -y nodejs
sudo apt install -y npm
```

### Scanmeister

To install `scanmeister`, open a terminal, go to desktop and clone from repo:

```
cd ~/Desktop
git clone https://github.com/djipco/surface-scanmeister
```

Once the repo is cloned, go inside folder and install all modules:

```
cd surface-scanmeister
npm install
```
### ~~crontab~~

~~To start `scanmeister` at boot, in Terminal:~~

```
bash
crontab -e
```

~~Insert:~~

```
@reboot (sleep 20; /home/scanmeister/surface-scanmeister/index.js) >> /home/scanmeister/surface-scanmeister/logs/scanmeister.log 2>&1
```


### SANE

SANE is the framework that provides support for a variety of scanners (and cameras). **It should already be installed**. If not:

```
sudo apt install sane
```

Once it's installed, you can check available devices with: 

```
sudo sane-find-scanner -q
```

or

```
scanimage -L
```


There is a [list of supported scanners](http://www.sane-project.org/sane-mfgs.html#SCANNERS) on the 
SANE website.



# OSC Schema

Trigger a scan on scanner connected to physical port 12:

* `/scan/12`

On startup and shutdown, the system broadcasts this message:

* `/system/status i 0 (or 1)`



# Testing the scanning environment

## scanimage

The `scanimage` command is installed by default in Raspbian. This is what is used to trigger 
scanning. You can calso list available devices:

```scanimage --list-devices```

Result:

```
device `genesys:libusb:001:009' is a Canon LiDE 210 flatbed scanner
device `genesys:libusb:001:008' is a Canon LiDE 210 flatbed scanner
```

### Retrieve options for device (the options varies from device to device)

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

You can debug by adding environment variables like so:

```SANE_DEBUG_DLL=255 SANE_DEBUG_HPAIO=255 SANE_DEBUG_SANEI_TCP=255 scanimage --device-name=genesys:libusb:001:072 --format=png --mode=Color > test2.png```

More details on debugging here: https://docs.fedoraproject.org/en-US/quick-docs/cups-debug-scanning-issues/


### Perform a manual scan

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

### Send data to TD over TCP

To quickly test the system, it is possible to pipe the output of `scanimage` into `nc` in order to 
send it to TouchDesigner over a TCP connection:

```scanimage --format=pnm --mode=Color | nc -q 0 10.0.0.200 1234```

In this scenario, the image will appear in TD in the `image0` component. The format **must be** `pnm` and 
the mode **must be** `Color`. This yiels a PNM in the P6 format.

The **scanmeister** daemon running on the Pi does the same thing behind the scene. To identify which
device the image is coming from, **scanmeister** adds a comment on the first line of the output. This
is why images sent by **scanmeister** are properly indexed from 1 to 16 (matching the hardware device
number).

## USB Devices

USB devices are listed in `/dev/bus/usb`. You can also list them with:

```shell
lsusb
```

Hierachical view (tree view):

```shell
lsusb -t
```

## USB Physical Ports

`scanimage` does not provide physical port information. This information can be fetched with 
`usb-devices` (also installed by default). This is what the code uses to figure which device is on 
which port:

```
usb-devices
```


