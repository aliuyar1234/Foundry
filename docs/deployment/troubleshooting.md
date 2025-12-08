# Troubleshooting Guide

Common issues and solutions for Foundry deployments.

## Quick Diagnostics

### Health Check Commands

```bash
# Kubernetes deployment status
kubectl get pods -n foundry
kubectl get svc -n foundry
kubectl get events -n foundry --sort-by='.lastTimestamp'

# Docker Compose status
docker compose ps
docker compose logs --tail=100

# Application health
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3000/health/ready | jq
```

### Log Collection

```bash
# Kubernetes logs
kubectl logs -l app=foundry-backend -n foundry --tail=500
kubectl logs -l app=foundry-worker -n foundry --tail=500

# Docker Compose logs
docker compose logs backend --tail=500
docker compose logs worker --tail=500

# Filter for errors
kubectl logs -l app=foundry-backend -n foundry | grep -i error
```

## Application Issues

### API Not Responding

**Symptoms:**
- Requests timeout
- 502/503 errors from load balancer
- Health checks failing

**Diagnosis:**
```bash
# Check pod status
kubectl get pods -n foundry -o wide

# Check if pods are running
kubectl describe pod <pod-name> -n foundry

# Check service endpoints
kubectl get endpoints foundry-backend -n foundry

# Test internal connectivity
kubectl run -it --rm debug --image=curlimages/curl -- \
  curl -v http://foundry-backend.foundry:3000/health
```

**Solutions:**

1. **Pods not starting:**
   ```bash
   # Check events
   kubectl get events -n foundry --field-selector involvedObject.name=<pod-name>

   # Check resource limits
   kubectl describe node | grep -A5 "Allocated resources"
   ```

2. **CrashLoopBackOff:**
   ```bash
   # Check logs from previous instance
   kubectl logs <pod-name> -n foundry --previous

   # Common causes:
   # - Database connection failed
   # - Missing environment variables
   # - Configuration errors
   ```

3. **OOMKilled:**
   ```bash
   # Check memory usage
   kubectl top pods -n foundry

   # Increase memory limit
   kubectl patch deployment foundry-backend -n foundry \
     -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","resources":{"limits":{"memory":"4Gi"}}}]}}}}'
   ```

### High Latency

**Symptoms:**
- Slow API responses
- Request timeouts
- User complaints about performance

**Diagnosis:**
```bash
# Check CPU/memory usage
kubectl top pods -n foundry

# Check database connection pool
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run db:pool:status

# Check slow queries in PostgreSQL
kubectl exec foundry-postgresql-0 -n foundry -- \
  psql -U foundry -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10;"
```

**Solutions:**

1. **Scale horizontally:**
   ```bash
   kubectl scale deployment foundry-backend --replicas=5 -n foundry
   ```

2. **Check database indexes:**
   ```sql
   -- Find missing indexes
   SELECT schemaname, tablename, attname, n_distinct, correlation
   FROM pg_stats
   WHERE schemaname = 'public'
   AND n_distinct > 100
   ORDER BY n_distinct DESC;
   ```

3. **Enable query caching:**
   ```bash
   # Check Redis cache hit rate
   redis-cli INFO stats | grep keyspace
   ```

### Authentication Failures

**Symptoms:**
- 401 Unauthorized errors
- JWT validation failures
- SSO login issues

**Diagnosis:**
```bash
# Check JWT secret consistency
kubectl get secret foundry-secrets -n foundry -o jsonpath='{.data.jwt-secret}' | base64 -d

# Check SAML/OIDC configuration
kubectl exec deployment/foundry-backend -n foundry -- \
  cat /app/config/sso.json

# Check auth logs
kubectl logs -l app=foundry-backend -n foundry | grep -i "auth\|jwt\|token"
```

**Solutions:**

1. **JWT secret mismatch:**
   ```bash
   # Ensure all pods have the same secret
   kubectl rollout restart deployment/foundry-backend -n foundry
   ```

2. **Token expired:**
   ```bash
   # Check token expiration settings
   kubectl exec deployment/foundry-backend -n foundry -- \
     env | grep JWT_EXPIRATION
   ```

3. **SSO certificate issues:**
   ```bash
   # Verify SAML certificate
   openssl x509 -in idp-cert.pem -text -noout
   ```

## Database Issues

### PostgreSQL Connection Errors

**Symptoms:**
- "Connection refused" errors
- "Too many connections" errors
- Slow queries

**Diagnosis:**
```bash
# Check PostgreSQL pod status
kubectl get pods -l app.kubernetes.io/name=postgresql -n foundry

# Check connection count
kubectl exec foundry-postgresql-0 -n foundry -- \
  psql -U foundry -c "SELECT count(*) FROM pg_stat_activity;"

# Check for locks
kubectl exec foundry-postgresql-0 -n foundry -- \
  psql -U foundry -c "SELECT * FROM pg_locks WHERE NOT granted;"
```

**Solutions:**

1. **Connection pool exhausted:**
   ```bash
   # Increase pool size in PgBouncer
   kubectl edit configmap pgbouncer-config -n foundry
   # Set: default_pool_size = 100

   kubectl rollout restart deployment/pgbouncer -n foundry
   ```

2. **Long-running queries:**
   ```sql
   -- Kill long-running queries
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE duration > interval '5 minutes'
   AND state = 'active';
   ```

3. **Disk space full:**
   ```bash
   # Check disk usage
   kubectl exec foundry-postgresql-0 -n foundry -- df -h /var/lib/postgresql/data

   # Vacuum database
   kubectl exec foundry-postgresql-0 -n foundry -- \
     psql -U foundry -c "VACUUM FULL ANALYZE;"
   ```

### Neo4j Issues

**Symptoms:**
- Graph queries timing out
- "Out of memory" errors
- High heap usage

**Diagnosis:**
```bash
# Check Neo4j status
kubectl exec foundry-neo4j-0 -n foundry -- \
  cypher-shell "CALL dbms.listQueries() YIELD queryId, username, query, elapsedTimeMillis WHERE elapsedTimeMillis > 10000 RETURN *"

# Check heap usage
kubectl exec foundry-neo4j-0 -n foundry -- \
  cypher-shell "CALL dbms.queryJmx('java.lang:type=Memory') YIELD name, attributes RETURN name, attributes.HeapMemoryUsage"
```

**Solutions:**

1. **Increase heap size:**
   ```yaml
   # Update Neo4j config
   dbms.memory.heap.initial_size: 4g
   dbms.memory.heap.max_size: 8g
   dbms.memory.pagecache.size: 4g
   ```

2. **Optimize query:**
   ```cypher
   // Add index if missing
   CREATE INDEX entity_idx FOR (n:Process) ON (n.entityId);

   // Use EXPLAIN to analyze query
   EXPLAIN MATCH (p:Process {entityId: $entityId})-[:HAS_STEP]->(s:Step) RETURN p, s;
   ```

3. **Clear query cache:**
   ```cypher
   CALL db.clearQueryCaches();
   ```

### Redis Issues

**Symptoms:**
- Cache misses
- "OOM command not allowed" errors
- High memory usage

**Diagnosis:**
```bash
# Check Redis info
kubectl exec foundry-redis-master-0 -n foundry -- redis-cli INFO

# Check memory
kubectl exec foundry-redis-master-0 -n foundry -- redis-cli INFO memory

# Check connected clients
kubectl exec foundry-redis-master-0 -n foundry -- redis-cli CLIENT LIST
```

**Solutions:**

1. **Memory limit reached:**
   ```bash
   # Check eviction policy
   kubectl exec foundry-redis-master-0 -n foundry -- \
     redis-cli CONFIG GET maxmemory-policy

   # Set LRU eviction
   kubectl exec foundry-redis-master-0 -n foundry -- \
     redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

2. **Too many connections:**
   ```bash
   # Increase max clients
   kubectl exec foundry-redis-master-0 -n foundry -- \
     redis-cli CONFIG SET maxclients 20000
   ```

3. **Clear cache:**
   ```bash
   # Flush specific keys (careful in production!)
   kubectl exec foundry-redis-master-0 -n foundry -- \
     redis-cli --scan --pattern "cache:*" | xargs redis-cli DEL
   ```

## Kubernetes Issues

### Pod Scheduling Failures

**Symptoms:**
- Pods stuck in "Pending" state
- "Insufficient cpu/memory" events

**Diagnosis:**
```bash
# Check pod events
kubectl describe pod <pod-name> -n foundry

# Check node resources
kubectl describe nodes | grep -A5 "Allocated resources"

# Check taints
kubectl get nodes -o custom-columns=NAME:.metadata.name,TAINTS:.spec.taints
```

**Solutions:**

1. **Insufficient resources:**
   ```bash
   # Scale up cluster (cloud-specific)
   # Or reduce resource requests
   kubectl patch deployment foundry-backend -n foundry \
     -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","resources":{"requests":{"cpu":"100m","memory":"256Mi"}}}]}}}}'
   ```

2. **Node affinity issues:**
   ```yaml
   # Add node selector
   spec:
     nodeSelector:
       workload-type: general
   ```

3. **PVC not bound:**
   ```bash
   # Check PVC status
   kubectl get pvc -n foundry

   # Check storage class
   kubectl get storageclass
   ```

### Ingress Issues

**Symptoms:**
- External access not working
- SSL certificate errors
- 404 errors

**Diagnosis:**
```bash
# Check ingress status
kubectl get ingress -n foundry

# Check ingress controller logs
kubectl logs -l app.kubernetes.io/name=ingress-nginx -n ingress-nginx

# Check certificate
kubectl describe certificate foundry-tls -n foundry
```

**Solutions:**

1. **Certificate not issued:**
   ```bash
   # Check cert-manager logs
   kubectl logs -l app=cert-manager -n cert-manager

   # Check ACME challenge
   kubectl get challenge -n foundry

   # Force certificate renewal
   kubectl delete certificate foundry-tls -n foundry
   ```

2. **Backend service not found:**
   ```bash
   # Verify service exists
   kubectl get svc foundry-backend -n foundry

   # Check endpoints
   kubectl get endpoints foundry-backend -n foundry
   ```

3. **Path routing issues:**
   ```bash
   # Check ingress rules
   kubectl get ingress foundry-ingress -n foundry -o yaml
   ```

## Worker/Job Issues

### Jobs Not Processing

**Symptoms:**
- Queue backlog growing
- Jobs stuck in "waiting" state
- Worker pods idle

**Diagnosis:**
```bash
# Check worker pods
kubectl get pods -l app=foundry-worker -n foundry

# Check queue status
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run queue:status

# Check worker logs
kubectl logs -l app=foundry-worker -n foundry --tail=200
```

**Solutions:**

1. **Workers not consuming:**
   ```bash
   # Restart workers
   kubectl rollout restart deployment/foundry-worker -n foundry
   ```

2. **Dead letter queue full:**
   ```bash
   # Check failed jobs
   kubectl exec deployment/foundry-backend -n foundry -- \
     npm run queue:failed:list

   # Retry failed jobs
   kubectl exec deployment/foundry-backend -n foundry -- \
     npm run queue:failed:retry
   ```

3. **Redis queue issue:**
   ```bash
   # Check queue keys
   kubectl exec foundry-redis-master-0 -n foundry -- \
     redis-cli KEYS "bull:*"

   # Check queue length
   kubectl exec foundry-redis-master-0 -n foundry -- \
     redis-cli LLEN "bull:default:wait"
   ```

## AI/ML Issues

### AI Provider Errors

**Symptoms:**
- AI features not working
- "API key invalid" errors
- Timeout errors

**Diagnosis:**
```bash
# Check AI configuration
kubectl exec deployment/foundry-backend -n foundry -- \
  env | grep -i "openai\|anthropic\|ai_"

# Check AI provider status
curl -s https://status.openai.com/api/v2/status.json | jq

# Check logs for AI errors
kubectl logs -l app=foundry-backend -n foundry | grep -i "ai\|openai\|anthropic"
```

**Solutions:**

1. **Invalid API key:**
   ```bash
   # Update secret
   kubectl create secret generic ai-secrets \
     --from-literal=openai-api-key="sk-..." \
     --dry-run=client -o yaml | kubectl apply -f -

   kubectl rollout restart deployment/foundry-backend -n foundry
   ```

2. **Rate limiting:**
   ```bash
   # Check rate limit settings
   kubectl exec deployment/foundry-backend -n foundry -- \
     env | grep AI_RATE_LIMIT

   # Reduce request rate
   kubectl set env deployment/foundry-backend -n foundry \
     AI_RATE_LIMIT_REQUESTS_PER_MINUTE=30
   ```

3. **Timeout issues:**
   ```bash
   # Increase timeout
   kubectl set env deployment/foundry-backend -n foundry \
     AI_REQUEST_TIMEOUT_MS=60000
   ```

## Performance Diagnostics

### Memory Analysis

```bash
# Get memory snapshot
kubectl exec deployment/foundry-backend -n foundry -- \
  node --expose-gc -e "global.gc(); console.log(process.memoryUsage())"

# Generate heap dump (requires debug build)
kubectl exec deployment/foundry-backend -n foundry -- \
  kill -USR2 1

# Copy heap dump
kubectl cp foundry/foundry-backend-xxx:/tmp/heapdump.heapsnapshot ./heapdump.heapsnapshot
```

### CPU Profiling

```bash
# Generate CPU profile
kubectl exec deployment/foundry-backend -n foundry -- \
  node --prof-process isolate-*.log > processed.txt

# Flame graph (if enabled)
kubectl exec deployment/foundry-backend -n foundry -- \
  npm run profile:cpu
```

### Network Analysis

```bash
# Check DNS resolution
kubectl run -it --rm debug --image=busybox -- \
  nslookup foundry-backend.foundry.svc.cluster.local

# Check TCP connectivity
kubectl run -it --rm debug --image=nicolaka/netshoot -- \
  nc -zv foundry-postgresql 5432

# Check latency
kubectl run -it --rm debug --image=curlimages/curl -- \
  curl -w "@curl-format.txt" -o /dev/null -s http://foundry-backend.foundry:3000/health
```

## Emergency Procedures

### Emergency Pod Kill

```bash
# Force delete stuck pod
kubectl delete pod <pod-name> -n foundry --force --grace-period=0

# Delete all pods (triggers recreation)
kubectl delete pods --all -n foundry
```

### Emergency Rollback

```bash
# Rollback deployment
kubectl rollout undo deployment/foundry-backend -n foundry

# Rollback to specific revision
kubectl rollout undo deployment/foundry-backend -n foundry --to-revision=2

# Check rollout history
kubectl rollout history deployment/foundry-backend -n foundry
```

### Emergency Scaling

```bash
# Scale to zero (stop all processing)
kubectl scale deployment foundry-backend --replicas=0 -n foundry
kubectl scale deployment foundry-worker --replicas=0 -n foundry

# Scale back up
kubectl scale deployment foundry-backend --replicas=3 -n foundry
kubectl scale deployment foundry-worker --replicas=2 -n foundry
```

### Database Emergency Access

```bash
# Direct PostgreSQL access
kubectl port-forward svc/foundry-postgresql 5432:5432 -n foundry &
psql -h localhost -U foundry -d foundry

# Direct Neo4j access
kubectl port-forward svc/foundry-neo4j 7474:7474 7687:7687 -n foundry &
cypher-shell -a bolt://localhost:7687 -u neo4j -p <password>

# Direct Redis access
kubectl port-forward svc/foundry-redis-master 6379:6379 -n foundry &
redis-cli -h localhost
```

## Log Analysis

### Common Log Patterns

```bash
# Find all errors
kubectl logs -l app=foundry-backend -n foundry | jq 'select(.level == "error")'

# Find slow requests
kubectl logs -l app=foundry-backend -n foundry | jq 'select(.duration > 1000)'

# Find by request ID
kubectl logs -l app=foundry-backend -n foundry | jq 'select(.requestId == "abc-123")'

# Find by entity
kubectl logs -l app=foundry-backend -n foundry | jq 'select(.entityId == "entity-456")'
```

### Export Logs for Analysis

```bash
# Export last hour of logs
kubectl logs -l app=foundry-backend -n foundry --since=1h > backend-logs.json

# Export with timestamps
kubectl logs -l app=foundry-backend -n foundry --timestamps > backend-logs-ts.json

# Compress and transfer
kubectl logs -l app=foundry-backend -n foundry --since=24h | gzip > backend-24h.log.gz
```
