#!/bin/bash

# Benchmark script for measuring spin-up times
set -e

BENCHMARK_RUNS=${1:-3}
COMPOSE_FILE=${2:-docker-compose.yml}

echo "Benchmarking startup time with $COMPOSE_FILE (${BENCHMARK_RUNS} runs)"
echo "=============================================="

TOTAL_TIME=0
RESULTS=()

for i in $(seq 1 $BENCHMARK_RUNS); do
    echo "Run $i/$BENCHMARK_RUNS:"
    
    # Ensure clean state
    docker compose -f $COMPOSE_FILE down >/dev/null 2>&1 || true
    docker system prune -f >/dev/null 2>&1 || true
    
    # Start timing
    START_TIME=$(date +%s%3N)
    
    # Start service
    docker compose -f $COMPOSE_FILE up -d >/dev/null 2>&1
    
    # Wait for health check to pass
    echo -n "  Waiting for service to be ready."
    while true; do
        if curl -s -f http://localhost:8082/health >/dev/null 2>&1; then
            READY_TIME=$(date +%s%3N)
            break
        fi
        echo -n "."
        sleep 0.5
    done
    
    ELAPSED=$((READY_TIME - START_TIME))
    TOTAL_TIME=$((TOTAL_TIME + ELAPSED))
    RESULTS+=($ELAPSED)
    
    echo " Ready! (${ELAPSED}ms)"
    
    # Get detailed startup metrics
    METRICS=$(curl -s http://localhost:8082/health | jq -r '.startup.totalElapsed // "N/A"')
    echo "  App startup time: ${METRICS}ms"
    
    # Clean up
    docker compose -f $COMPOSE_FILE down >/dev/null 2>&1
    
    # Brief pause between runs
    sleep 2
done

echo ""
echo "Results Summary:"
echo "=============================================="

AVERAGE=$((TOTAL_TIME / BENCHMARK_RUNS))
echo "Average startup time: ${AVERAGE}ms"

# Calculate min/max
MIN=${RESULTS[0]}
MAX=${RESULTS[0]}
for time in "${RESULTS[@]}"; do
    [ $time -lt $MIN ] && MIN=$time
    [ $time -gt $MAX ] && MAX=$time
done

echo "Fastest: ${MIN}ms"
echo "Slowest: ${MAX}ms"
echo "Individual results: ${RESULTS[*]}"

# Save results to file
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
RESULTS_FILE="benchmark_results_${TIMESTAMP}.json"

cat > $RESULTS_FILE << EOF
{
  "timestamp": "$(date -Iseconds)",
  "compose_file": "$COMPOSE_FILE",
  "runs": $BENCHMARK_RUNS,
  "results_ms": [$(IFS=,; echo "${RESULTS[*]}")],
  "average_ms": $AVERAGE,
  "min_ms": $MIN,
  "max_ms": $MAX
}
EOF

echo "Results saved to: $RESULTS_FILE"