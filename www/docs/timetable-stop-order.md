---
id: timetable-stop-order
title: timetable_stop_order.txt
---

This is an optional, non-standard file called `timetable_stop_order.txt` which can be included in an agency's GTFS. It is used to specify stop order for a particular timetable. It is useful when generating combined timetables for multiple overlapping routes, or exerting fine-grained control on stop order.

This file is usually only needed if a route gas trips with different stop order.

An example of this file is located in [examples/timetable_stop_order.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/timetable_stop_order.txt). The format of this file is:

| column name | description |
| ----------- | ----------- |
| `timetable_id` | The ID of the timetable from `timetables.txt` |
| `stop_id` | The ID of the stop from `stops.txt`. |
| `stop_sequence` | An assigned integer identifying the order of stops to be presented in the timetable. The values for `stop_sequence` must be non-negative integers, and they must increase along the trip. This value does not need to match the `stop_sequence` found in `stop_times.txt`. |

## Stops with different arrival and departure times

Stoptimes with different arrival and departure times will be shown twice in a row and labeled as "(arrival)" and "(departure)".
