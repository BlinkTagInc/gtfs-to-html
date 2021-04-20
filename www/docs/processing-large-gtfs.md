---
id: processing-large-gtfs
title: Processing very large GTFS files
---

By default, node has a memory limit of 512 MB or 1 GB. If you have a very large GTFS file and want to use the option `showOnlyTimepoint` = `false` you may need to allocate more memory. Use the `max-old-space-size` option. For example to allocate 4 GB:

    NODE_OPTIONS=--max_old_space_size=4096 gtfs-to-html
