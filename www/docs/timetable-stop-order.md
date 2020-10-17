---
id: timetable-stop-order
title: timetable_stop_order.txt
---

This is an optional, non-standard file called `timetable_stop_order.txt` which can be included in an agency's GTFS. It is used to specify stop order for a particular timetable. It is useful when generating combined timetables for multiple overlapping routes, or exerting fine-grained control on stop order.

This file is often not needed. If all trips for a route serve the same set of stops, or all trips stop order is topologically sortable, there is no need to use `timetable_stop_order.txt` for that route. `timetable_stop_order.txt` is only needed for routes where some trips serve completely different stops than other trips and where the order can not be determined using a directed graph.

GTFS-to-HTML uses [toposort](https://www.npmjs.com/package/toposort) to sort stops for each trip topologically iin a directed graph to determine a valid stop order for use in a timetable. If stop order across trips is cyclic or disjointed (i.e. not all trips have a common stop) then the stop order from trip with most number of stops is used as a fallback.

| column name | description |
| ----------- | ----------- |
| `timetable_id` | The ID of the timetable from `timetables.txt` |
| `stop_id` | The ID of the stop from `stops.txt`. |
| `stop_sequence` | An assigned integer identifying the order of stops to be presented in the timetable. The values for `stop_sequence` must be non-negative integers, and they must increase along the trip. This value does not need to match the `stop_sequence` found in `stop_times.txt`. |

### Example

Route 1, trip 1 stops:

    _____/‾‾‾\___
    A B C D E H I

Route 2, trip 2 stops:

    ‾‾‾‾‾\___/‾‾‾
    A B C F G H I

The `timetable_stop_order.txt` for this route would be:

```csv
timetable_id,stop_id,stop_sequence
1,A,0
1,B,1
1,C,2
1,D,3
1,E,4
1,F,5
1,G,6
1,H,7
1,I,8
```

Or, if you'd like to show stops `F` and `G` before stops `D` and `E` on the timetable:
```csv
timetable_id,stop_id,stop_sequence
1,A,0
1,B,1
1,C,2
1,F,3
1,G,4
1,D,5
1,E,6
1,H,7
1,I,8
```

An example of this file is located in [examples/timetable_stop_order.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/timetable_stop_order.txt).

## Stops with different arrival and departure times

Stoptimes with different arrival and departure times will be shown twice in a row and labeled as "(arrival)" and "(departure)". There is no need to put the same stop in timetable_stop_order twice in a row.
