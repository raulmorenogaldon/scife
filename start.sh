#!/bin/bash

#######################################################
#######################################################
#
# Example script for launching Scife and one minion
#
#######################################################
#######################################################

echo "THIS IS AN EXAMPLE SCRIPT! Please, do not run it without modifying it."

# Load environment
. ~/.nvm/nvm.sh 2>/dev/null
. ~/.bashrc 2>/dev/null

#############################################"
# CONFIGURATION FILES
#############################################"
CFG_OVERLORD="./extra/overlord.cfg"
CFG_STORAGE="./extra/storage.cfg"
CFG_MINION="./extra/cluster.cfg"
CFG_RSYNC="./extra/rsyncd.cfg"

#############################################"
# NODE PARAMETERS
#############################################"
NODE=v5.5.0
#############################################"
# SCIFE PARAMETERS
#############################################"
BRANCH=develop
#############################################"
# DATABASE PARAMETERS
#############################################"
DB_UID="database"
DB_BIN="mongod"
DB_PATH="/home/mongodb"
#DB_BIND="--bind_ip localhost"
#DB_PORT="--port 27017"
#DB_NUMA="`which numactl`"
#DB_NUMA_OPTS="--interleave all"
#############################################"
# GIT DAEMON PARAMETERS
#############################################"
GD_UID="gitdaemon"
GD_BIN="git daemon"
GD_OPTS="--reuseaddr --verbose"
GD_PATH="$HOME/appstorage"
#GD_PORT="--port=27478"
#############################################"
# RSYNC DAEMON PARAMETERS
#############################################"
RS_UID="rsyncd"
RS_BIN=`which rsync`
RS_OPTS="--daemon --no-detach --config=$CFG_RSYNC"
#############################################"
# WEB SERVER PARAMETERS
#############################################"
WB_UID="web"
WB_BIN="server.js"
WB_OPTS="web.cfg"
WB_PATH="$HOME/multicloud-web/public-server"
#############################################"

echo "#############################################"

# IDs
UUID_OVERLORD="overlord"
OVERLORD="overlord/app.js "$CFG_OVERLORD

UUID_STORAGE="storage"
STORAGE="storage/storage.js "$CFG_STORAGE

UUID_MINION="minion"
MINION="minions/cluster/cl_minion.js "$CFG_MINION

# Update repository
echo "Updating repository..."
git pull origin $BRANCH >/dev/null 2>&1
if [ $? -ne 0 ]; then
	echo "Repository update failed!"
fi

# Load NodeJS
echo "Loading NodeJS..."
hash node 2>&1 > /dev/null
if [ $? -ne 0 ]; then
	nvm use $NODE
fi

# Check if loaded correctly
hash node 2>&1 > /dev/null
if [ $? -ne 0 ]; then
	echo "NodeJS not found!"
	exit 1
fi

# Update packages
echo "Installing NodeJS packages..."
npm install -g forever 2>&1 > /dev/null
npm install 2>&1 > /dev/null
if [ $? -ne 0 ]; then
	echo "Package updating failed!"
fi

# Stop DB and Git
forever stop "$UUID_OVERLORD"
forever stop "$UUID_STORAGE"
forever stop "$UUID_MINION"
forever stop "$WB_UID"
forever stop "$DB_UID"
forever stop "$GD_UID"
forever stop "$RS_UID"
sleep 3

# Ensure
pkill -f mongod
pkill -f git-daemon
pkill -f rsyncd
sleep 3

# Launch database
echo "Launching database..."
forever restart "$DB_UID"  || forever start -a --uid "$DB_UID" extra/aux_system_command.js $DB_NUMA $DB_NUMA_OPTS $DB_BIN $DB_PORT $DB_BIND --dbpath $DB_PATH

# Launch Git daemon
echo "Launching Git daemon"
forever restart "$GD_UID"  || forever start -a --uid "$GD_UID" extra/aux_system_command.js $GD_BIN $GD_OPTS $GD_PORT --base-path=$GD_PATH

# Launch Rsync daemon
echo "Launching Rsync daemon"
forever restart "$RS_UID"  || forever start -a --uid "$RS_UID" extra/aux_system_command.js extra/launch_rsync.sh $RS_BIN $RS_OPTS

# Wait a little...
sleep 8

# Launch processes
echo "Launching SciFE..."
forever restart "$UUID_MINION"   || forever start -a --spinSleepTime 2000 --uid "$UUID_MINION"  $MINION
forever restart "$UUID_STORAGE"  || forever start -a --spinSleepTime 2000 --uid "$UUID_STORAGE"  $STORAGE
forever restart "$UUID_OVERLORD" || forever start -a --spinSleepTime 2000 --uid "$UUID_OVERLORD" $OVERLORD

echo "Launching SciFE Web..."
cd $WB_PATH
forever restart "$WB_UID"  || forever start -a --spinSleepTime 2000 --uid "$WB_UID" $WB_BIN $WB_OPTS

echo "DONE!"
echo "#############################################"
