---
id: stop-attributes
title: stop_attributes.txt
---

This is an optional, non-standard file called `stop_attributes.txt` which can be included in an agency's GTFS. This can be used to add additional useful information not included in GTFS, such as the city of each stop.

### Column Definitions

| column name | description |
| ----------- | ----------- |
| `stop_id` | A `stop_id` from `stops.txt` |
| `stop_city` | The name of the city or region that the stop is in. |

### Example

```csv
stop_id,stop_city
1001,"Fresno, CA"
1002,"Fresno, CA"
1003,"Hanford, CA"
1004,"Hanford, CA"
1005,"Lemoore, CA"
```

An example of this file is located in [examples/stop_attributes.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/stop_attributes.txt). 

:::note
This feature is in development. Fields may be added or changed in the future.
:::
