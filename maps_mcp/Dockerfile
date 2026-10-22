# syntax=docker/dockerfile:1
# Cross-compiles a static binary natively rather than building under emulation for each platform
FROM --platform=$BUILDPLATFORM ghcr.io/rust-cross/cargo-zigbuild:0.24.0 AS build
ARG TARGETARCH

WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    case "$TARGETARCH" in \
      amd64) target=x86_64-unknown-linux-musl ;; \
      arm64) target=aarch64-unknown-linux-musl ;; \
      *) echo "No build for $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && cargo zigbuild --release --locked --target "$target" \
    && cp "target/$target/release/navcat-mcp" /navcat-mcp

FROM scratch
COPY --from=build /navcat-mcp /navcat-mcp
USER 65534:65534
EXPOSE 8000
ENTRYPOINT ["/navcat-mcp"]
