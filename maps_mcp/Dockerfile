FROM rust:1 AS builder
WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y musl-tools
RUN rustup target add x86_64-unknown-linux-musl aarch64-unknown-linux-musl
COPY Cargo.toml Cargo.lock ./
COPY src ./src
ARG TARGETPLATFORM
# A static binary for the platform being built (or this machine's, without buildx)
RUN case "${TARGETPLATFORM:-linux/$(uname -m)}" in \
      linux/amd64 | linux/x86_64) RUST_TARGET=x86_64-unknown-linux-musl ;; \
      linux/arm64 | linux/aarch64) RUST_TARGET=aarch64-unknown-linux-musl ;; \
      *) echo "Unsupported platform: $TARGETPLATFORM" >&2; exit 1 ;; \
    esac \
    && cargo build --release --locked --target "$RUST_TARGET"

FROM scratch
COPY --from=builder /usr/src/app/target/*/release/navcat-mcp /navcat-mcp
USER 65534:65534
EXPOSE 8000
ENTRYPOINT ["/navcat-mcp"]
