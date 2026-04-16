# OTS — Build targets for Electron desktop app
#
# Local workflow:
#   make build          — build locally (backend + electron)
#   make run            — launch last build (builds if needed)
#   make build-run      — always build + launch
#   make build-push     — push code + tag → CI builds + releases
#
# CI runs: make build (same pipeline)

SHELL := /bin/bash
VERSION := $(shell node -p "require('./package.json').version")
TAG     ?= v$(VERSION)
APP_NAME := OTS
ARCH    := $(shell uname -m | sed 's/x86_64/x64/' | sed 's/aarch64/arm64/')
ZIP_NAME := OTS-$(VERSION)-mac-$(ARCH).zip

.PHONY: build build-run run build-push clean backend electron

# ── Helpers ─────────────────────────────────────────────

backend:
	@echo "=== Building Python backend binary ==="
	@bash scripts/build-backend.sh

electron:
	@echo "=== Compiling Electron + Vite ==="
	npm run build:electron
	@echo "=== Packaging with electron-builder ==="
	npx electron-builder build --mac --publish never

# ── Build ───────────────────────────────────────────────
# Build the full app (backend binary + Electron package)

build: backend electron
	@echo ""
	@echo "Build complete: release/$(ZIP_NAME)"
	@ls -lh release/*.zip 2>/dev/null
	@echo ""
	@echo "To install:"
	@echo "  1. Unzip release/$(ZIP_NAME)"
	@echo "  2. Move OTS.app to /Applications"
	@echo "  3. Launch OTS from Applications"

# ── Build + Run ─────────────────────────────────────────
# Build and immediately launch the app locally

build-run: build
	@echo ""
	@echo "=== Launching OTS ==="
	@open "$$(find release -name '$(APP_NAME).app' -maxdepth 2 | head -1)"

# ── Run ─────────────────────────────────────────────────
# Launch last build. Builds first if no app exists.

run:
	@APP=$$(find release -name '$(APP_NAME).app' -maxdepth 2 2>/dev/null | head -1); \
	if [ -z "$$APP" ]; then \
		echo "No build found — building first..."; \
		$(MAKE) build; \
		APP=$$(find release -name '$(APP_NAME).app' -maxdepth 2 | head -1); \
	fi; \
	echo "=== Launching OTS ==="; \
	open "$$APP"

# ── Build + Push ────────────────────────────────────────
# Push code + tag to GitHub. CI handles build + release.
# Override tag: make build-push TAG=v3.1.0

build-push:
	@echo "=== Pushing main and tagging $(TAG) ==="
	git tag -a "$(TAG)" -m "Release $(TAG)"
	GH_TOKEN=$$(gh auth token) git push https://jpurusho:$${GH_TOKEN}@github.com/jpurusho/ots.git main
	GH_TOKEN=$$(gh auth token) git push https://jpurusho:$${GH_TOKEN}@github.com/jpurusho/ots.git "$(TAG)"
	@echo ""
	@echo "Pushed $(TAG) — CI will build and create the release"
	@echo "  https://github.com/jpurusho/ots/actions"

# ── Clean ───────────────────────────────────────────────

clean:
	rm -rf release/ dist/ backend/dist/ backend/build/
	@echo "Cleaned build artifacts"
