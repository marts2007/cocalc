#!/usr/bin/env python

# This script is run by /etc/rc.local when booting up.  It does special configuration
# depending on what images are mounted, etc.

import os

if os.path.exists('/mnt/home/'):
    # Compute machine
    if not os.path.exists('/mnt/home/aquota.group'):
        os.system("quotacheck -cug /mnt/home")
        os.system("quotaon -a")

    # disable quotas for now, so that students in my class can do Sage development.
    os.system('quotaoff -a')

    # Restore user accounts
    if os.path.exists('/mnt/home/etc/'):
        os.system("cp /mnt/home/etc/* /etc/")
    else:
        os.system("mkdir -p /mnt/home/etc/")

    # Setup /tmp so it is on the external disk image (has that quota) and is clean, since this is a fresh boot.
    os.system("rm -rf /mnt/home/tmp; mkdir -p /mnt/home/tmp/; chmod +t /mnt/home/tmp; mount -o bind /mnt/home/tmp /tmp; chmod a+rwx /mnt/home/tmp/")

    os.system("mkdir -p /mnt/home/scratch; mkdir -p /scratch; chmod +t /mnt/home/tmp; mount -o bind /mnt/home/scratch /scratch;  chmod a+rwx /mnt/home/scratch/")

    # Remove .ssh keys on compute node from /mnt/home/salvus account, since this is a security risk (in case compute node is r00ted).
    os.system("rm -rf /mnt/home/salvus/.ssh/id_rsa*")
