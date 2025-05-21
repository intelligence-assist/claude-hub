#!/bin/bash
echo "Testing firewall initialization..."

docker run --rm \
  --privileged \
  --cap-add=NET_ADMIN \
  --cap-add=NET_RAW \
  --cap-add=SYS_TIME \
  --cap-add=DAC_OVERRIDE \
  --cap-add=AUDIT_WRITE \
  --cap-add=SYS_ADMIN \
  --entrypoint /bin/bash \
  claude-code-runner:latest \
  -c "whoami && /usr/local/bin/init-firewall.sh && echo 'Firewall initialized successfully'"