# TO DO
* Install `winston`for logging
* ~~send OSC (to report on status)~~
* Send file via netcat (if TD team fixes the issue, we need to check new version)
* Clarify the inbound and outbound OSC schema

# OSC Schema



# CONFIGURATION

## Raspbian

* Use **Raspberry Pi Imager.app** (or simialr) to create brand new boot medium for the Raspberry Pi 
  2 Model B (this is the model we are currently using).
* Create account named **surface**
* Connect to wifi
* Update everything:

  ```
  sudo apt update
  sudo apt upgrade -y
  ```

## SANE

SANE is the framework that provides support for a variety of scanners (and cameras):

```
sudo apt install sane
```

Once it's installed, you can check available devices with: 

```
sudo sane-find-scanner -q
```

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


### Perform scan

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
  --output-file='image008.png'
```

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

## Configure Access to Shared Folder

**On Windows:**

* Create a user that will be used to connect from the Raspberry Pi
* Share a folder where the scans should be stored

**On the Pi:**

* Create a folder to mount the remote directory to:

```sh
mkdir /home/surface/scans
```

Edit `fstab` so changes kick in at boot:

```sh
sudo nano /etc/fstab
```

Add the following line:

```sh
//10.0.0.132/Users/surface/project/scans /home/surface/scans cifs username=pi,password=pipipi,uid=1000,gid=1000 0 0
```

Mount everything that's in `/etc/fstab`:

```
sudo mount -a
```

If needed, you can mount and unmount manually: 

```
sudo umount /home/surface/scans
```

## Node.js

The control program is written in JavaScript so Node.js must be installed. First, we need to add the
source for Node's latest LTS version:

```
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
```

Then, we can install it:

```
sudo apt install -y nodejs
```

### sane-scan-image-wrapper

This is the wrapper module we are using. Just get it from npm.

## Git

Ask for credentials to be stored locally:

```
git config credential.helper store
```

Clone repo:

```
git clone https://github.com/djipco/surface-scanmeister
```
Enter credentials (once).

Update from repo (put it in folder called `code`):

```
git pull https://github.com/djipco/surface-scanmeister code
```

## Start at boot

In Terminal:

```bash
crontab -e
```

Insert:

```
@reboot (sleep 20; /home/surface/surface-scanmeister/index.js) >> /home/surface/surface-scanmeister/logs/scanmeister.log 2>&1
```