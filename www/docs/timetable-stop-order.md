---
id: timetable-stop-order
title: timetable_stop_order.txt
---

This is an optional, non-standard file called `timetable_stop_order.txt`. It is used to specify the order of stops for a timetable. It is useful when generating combined timetables for multiple overlapping routes, or exerting fine-grained control on stop order.

GTFS-to-HTML automatically sorts stops across trips using a directed graph. When trips visit stops in conflicting orders or loop back to an earlier stop, the generator starts with the longest stop sequence and merges the other sequences into it. A stop may appear more than once so each trip's times can be read in travel order. Use this file to choose a specific order or limit which stops appear.

When trip patterns can be sorted topologically, an alternate stop between two shared stops is placed as close as trip order allows to the geographically nearer shared stop. For example, with trips A–B–C–D–E–F and A–X–F, X appears just after A if it is closer to A, or just before F if it is closer to F. Equal distances or missing coordinates leave the computed order in place.

## Field Definitions

### timetable_stop_order.txt

Primary key (`timetable_id, stop_id, stop_sequence`)

| Field Name      | Type                                             | Presence     | Description                                                                                                                                                           |
| --------------- | ------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timetable_id`  | Foreign ID referencing `timetables.timetable_id` | **Required** | The ID of the timetable.                                                                                                                                              |
| `stop_id`       | Foreign ID referencing `stops.stop_id`           | **Required** | The ID of the stop.                                                                                                                                                   |
| `stop_sequence` | Non-negative integer                             | **Required** | An assigned integer identifying the order of stops to be presented in the timetable. This value does not need to match the `stop_sequence` found in `stop_times.txt`. |

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

An example of this file is located in [examples/timetable_stop_order.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/main/examples/timetable_stop_order.txt).

## Stops with different arrival and departure times

Stoptimes with different arrival and departure times will be shown twice in a row and labeled as "(arrival)" and "(departure)". There is no need to put the same stop in timetable_stop_order twice in a row.
