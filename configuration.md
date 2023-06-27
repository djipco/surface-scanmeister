# Raspbian

* Use **Raspberry Pi Imager.app** to create brand new boot medium for the Raspberry Pi 2 Model B.
* Create account named **surface**
* Connect to wifi
* Update

  ```
  sudo apt update
  sudo apt upgrade -y
  ```

# SANE

SANE is the framework that provides support for a variety of scanners (and cameras). It comes with `scanimage` which is the tool we are using.

```
sudo apt install sane
```

Once it's installed, you can check available devices with: 

```
sudo sane-find-scanner -q
```

# scanimage

Th `scanimage` command. isinstalled by default in Raspbian.

### List available devices

```scanimage --list-devices```

Result:

```
device `genesys:libusb:001:009' is a Canon LiDE 210 flatbed scanner
device `genesys:libusb:001:008' is a Canon LiDE 210 flatbed scanner
```

### Retrieve options for device (varies from device to device)

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

### Devices

Devices are in `/dev/bus/usb`.

# USB Physical Ports

`scanimage` does not provide physical port information. This information can be fetched with `usb-devices` (also installedc by default). This is what the code uses to figure which device is on which port:

```
usb-devices
```

# Configure Access to Shared Folder

**On Windows:**

* Create a user that will be used to connect from the Raspberry Pi
* Share a folder where the scans should be stored

**On the Pi:**

* Create a folder to mount the remote directory to:

```sh
mkdir /home/surface/scans_remote
```

Edit `fstab` so changes kick in at boot:

```sh
sudo nano /etc/fstab
```

Add the following line:

```sh
//10.0.0.132/Users/surface/project/scans /home/surface/scans_remote cifs username=pi,password=pipipi 0 0
```

Mount everything that's in `/etc/fstab`:

```
sudo mount -a
```

If needed, you can mount and unmount manuall: 

```
sudo umount /home/surface/scans_remote
```

# Node

The control program is written in JavaScript so Node.js must be installed. First, we need to add the source for Node's latest LTS version:

```
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
```

Then, we can install it:

```
sudo apt install -y nodejs
```

### sane-scan-image-wrapper

This is the wrapper module we are using. Just get it from npm.

# Git

Ask for credentials to be stored locally:

```
git config credential.helper store
```

Clone repo:

```
git clone https://github.com/djipco/surface-scanmeister
```
Enter credentials (once).

Update from repo:

```
git pull https://github.com/djipco/surface-scanmeister
```

# Start at boot

In Terminal:

```bash
crontab -e
```

Insert:

```
@reboot (sleep 20; /home/surface/surface-scanmeister/index.js) >> /home/surface/surface-scanmeister/logs/scanmeister.log 2>&1
```
