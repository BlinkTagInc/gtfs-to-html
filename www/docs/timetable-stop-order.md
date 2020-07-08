---
id: timetable-stop-order
title: timetable_stop_order.txt
---

This is an optional, non-standard file called `timetable_stop_order.txt` which can be included in an agency's GTFS. It is used to specify stop order for a particular timetable. It is useful when generating combined timetables for multiple overlapping routes, or exerting fine-grained control on stop order.

This file is usually only needed if a route gas trips with different stop order.

### Column Definitions

| column name | description |
| ----------- | ----------- |
| `timetable_id` | The ID of the timetable from `timetables.txt` |
| `stop_id` | The ID of the stop from `stops.txt`. |
| `stop_sequence` | An assigned integer identifying the order of stops to be presented in the timetable. The values for `stop_sequence` must be non-negative integers, and they must increase along the trip. This value does not need to match the `stop_sequence` found in `stop_times.txt`. |

### Example

```csv
timetable_id,stop_id,stop_sequence
81,757717,0
81,757722,1
81,757728,2
81,757668,3
81,757751,4
81,757683,5
81,757689,6
81,757691,7
81,757692,8
81,757700,9
81,757703,10
81,757068,11
81,757074,12
81,757080,13
81,757277,14
```

An example of this file is located in [examples/timetable_stop_order.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/timetable_stop_order.txt).

## Stops with different arrival and departure times

Stoptimes with different arrival and departure times will be shown twice in a row and labeled as "(arrival)" and "(departure)". There is no need to put the same stop in timetable_stop_order twice in a row.
