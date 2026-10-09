FROM maven:3.9-eclipse-temurin-25 AS build

# A pinned master commit: our profiles use the cycleway encoded value, which isn't in a release
# yet (11.1 is the latest). Move to the 12.0 tag once it's out.
ARG GH_REF=1cc4d7bfdea655166c0dc1dce25dec8524a3acc0

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /graphhopper

# Fetching by name works for a tag or a commit
RUN git init -q \
    && git fetch -q --depth 1 https://github.com/graphhopper/graphhopper.git "${GH_REF}" \
    && git checkout -q FETCH_HEAD

# The crossing encoded value only counts signalised crossings; this adds the lights at
# junctions (highway=traffic_signals) so the app can avoid them. Needs a graph rebuild.
COPY traffic-signals.patch /tmp/
RUN git apply /tmp/traffic-signals.patch

RUN mvn clean install -DskipTests

FROM eclipse-temurin:25-jre

ENV JAVA_OPTS="-Xmx1g -Xms1g"

# curl is used by the healthcheck, wget by graphhopper.sh --url
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl wget \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data

WORKDIR /graphhopper

COPY --from=build /graphhopper/web/target/graphhopper*.jar ./
# Profiles: changing them or their encoded values needs the graph rebuilt (./maps update routing)
COPY graphhopper.sh config.yml traffic-signals.patch ./
COPY custom_models ./custom_models
# A graph only works with the config it was built with: the import stores this next to it, and
# ./maps rebuilds the graph when a new image's differs
RUN cat config.yml traffic-signals.patch custom_models/* | sha256sum > graph-config.sha

VOLUME [ "/data" ]

EXPOSE 8989 8990

HEALTHCHECK --interval=5s --timeout=3s CMD curl --fail http://localhost:8989/health || exit 1

ENTRYPOINT [ "bash", "./graphhopper.sh", "-c", "config.yml" ]
