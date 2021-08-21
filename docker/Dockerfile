# syntax=docker/dockerfile:1
FROM node:16

RUN apt update
RUN apt install -y chromium

RUN cd ~/
COPY config.json ./

RUN npm -g config set user root
RUN npm install -g gtfs-to-html

CMD [ "gtfs-to-html" ]