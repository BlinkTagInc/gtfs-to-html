---
id: reviewing-changes
title: Reviewing changes in HTML timetables
---

When an agency releases an updated GTFS file, it can be useful to review what has changed when generating HTML timetables. Use `diff2html` to easily compare two folders of html timetables.

First generate two folders of `gtfs-to-html` output to compare. To make it easy to see what has changed, set the `beautify` option to `true` in the config file for both sets of output.

Then, install diff2html:

    npm install -g diff2html-cli

Use the `diff` command and pipe the output to `diff2html` to get a nicely formatted list of the differences between two folders of html files.

    diff -bur html/folder1 html/folder2 |  diff2html -i stdin
