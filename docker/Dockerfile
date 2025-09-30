# syntax=docker/dockerfile:1
FROM node:22

RUN apt update
RUN apt install -y chromium

RUN cd ~/
COPY config.json ./

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV NODE_OPTIONS=--max-old-space-size=8192
ENV PATH=$PATH:/home/node/.npm-global/bin
RUN npm install -g gtfs-to-html

CMD [ "gtfs-to-html" ]