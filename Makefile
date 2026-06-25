# web-kit — drop-in web utilities (PWA install banner + ws-rpc client).
# Packages are consumed via GitHub install, so dist/ is committed.

.PHONY: build test install

install:
	@[ -d node_modules ] || npm install

# Compile both packages (refreshes the committed dist/).
build: install
	npm run build

# Unit tests (vitest across packages).
test: install
	npm test
