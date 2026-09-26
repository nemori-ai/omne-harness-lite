#!/bin/sh
trap 'sleep 35; touch /opt/omne-probe/stopped; exit 0' TERM
touch /opt/omne-probe/started
while :; do sleep 1; done
