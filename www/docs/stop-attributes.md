---
id: stop-attributes
title: stop_attributes.txt
---

This is an optional, non-standard file called `stop_attributes.txt` which can be included in an agency's GTFS. This can be used to add additional useful information not included in GTFS, such as the city that the stop is in

An example of this file is located in [examples/stop_attributes.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/stop_attributes.txt). This feature is in development and additional fields may be added or changes to the way this works could happen in the future.

The format of this file is:

| column name | description |
| ----------- | ----------- |
| `stop_id` | A `stop_id` from `stops.txt` |
| `stop_city` | The name of the city or region that the stop is in. |
