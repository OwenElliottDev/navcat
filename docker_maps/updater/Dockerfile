FROM docker:28-cli

# Time zones, so schedules are in local time (TZ)
RUN apk add --no-cache tzdata

COPY schedule.sh /schedule.sh
ENTRYPOINT ["sh", "/schedule.sh"]
