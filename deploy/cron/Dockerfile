# Image for the `cron` sidecar: busybox crond plus curl and tzdata, installed at build time so a container
# (re)start never depends on reaching the Alpine package mirrors.
FROM alpine:3.20
RUN apk add --no-cache curl tzdata
