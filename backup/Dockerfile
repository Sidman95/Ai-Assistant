FROM alpine:3.21

RUN apk add --no-cache sqlite tzdata

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh && mkdir -p /backups && chown 12000:12000 /backups

USER 12000:12000
CMD ["/backup.sh"]
