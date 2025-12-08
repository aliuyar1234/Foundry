{{/*
=============================================================================
Foundry Helm Chart - Template Helpers
SCALE Tier - Task T155

Common template helpers for the Foundry Helm chart
=============================================================================
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "foundry.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "foundry.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "foundry.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "foundry.labels" -}}
helm.sh/chart: {{ include "foundry.chart" . }}
{{ include "foundry.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "foundry.selectorLabels" -}}
app.kubernetes.io/name: {{ include "foundry.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend labels
*/}}
{{- define "foundry.backend.labels" -}}
{{ include "foundry.labels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Backend selector labels
*/}}
{{- define "foundry.backend.selectorLabels" -}}
{{ include "foundry.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Frontend labels
*/}}
{{- define "foundry.frontend.labels" -}}
{{ include "foundry.labels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Frontend selector labels
*/}}
{{- define "foundry.frontend.selectorLabels" -}}
{{ include "foundry.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Worker labels
*/}}
{{- define "foundry.worker.labels" -}}
{{ include "foundry.labels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Worker selector labels
*/}}
{{- define "foundry.worker.selectorLabels" -}}
{{ include "foundry.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "foundry.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "foundry.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the proper image name for backend
*/}}
{{- define "foundry.backend.image" -}}
{{- $registryName := .Values.global.imageRegistry -}}
{{- $repositoryName := .Values.backend.image.repository -}}
{{- $tag := .Values.backend.image.tag | default .Chart.AppVersion -}}
{{- if $registryName }}
{{- printf "%s/%s:%s" $registryName $repositoryName $tag -}}
{{- else }}
{{- printf "%s:%s" $repositoryName $tag -}}
{{- end }}
{{- end }}

{{/*
Return the proper image name for frontend
*/}}
{{- define "foundry.frontend.image" -}}
{{- $registryName := .Values.global.imageRegistry -}}
{{- $repositoryName := .Values.frontend.image.repository -}}
{{- $tag := .Values.frontend.image.tag | default .Chart.AppVersion -}}
{{- if $registryName }}
{{- printf "%s/%s:%s" $registryName $repositoryName $tag -}}
{{- else }}
{{- printf "%s:%s" $repositoryName $tag -}}
{{- end }}
{{- end }}

{{/*
Return the proper image name for worker
*/}}
{{- define "foundry.worker.image" -}}
{{- $registryName := .Values.global.imageRegistry -}}
{{- $repositoryName := .Values.worker.image.repository -}}
{{- $tag := .Values.worker.image.tag | default .Chart.AppVersion -}}
{{- if $registryName }}
{{- printf "%s/%s:%s" $registryName $repositoryName $tag -}}
{{- else }}
{{- printf "%s:%s" $repositoryName $tag -}}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL hostname
*/}}
{{- define "foundry.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "foundry.fullname" .) -}}
{{- else }}
{{- .Values.externalDatabase.host -}}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL port
*/}}
{{- define "foundry.postgresql.port" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "5432" -}}
{{- else }}
{{- .Values.externalDatabase.port | toString -}}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL database name
*/}}
{{- define "foundry.postgresql.database" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.database -}}
{{- else }}
{{- .Values.externalDatabase.database -}}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL username
*/}}
{{- define "foundry.postgresql.username" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.username -}}
{{- else }}
{{- .Values.externalDatabase.username -}}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL secret name
*/}}
{{- define "foundry.postgresql.secretName" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.existingSecret -}}
{{- else }}
{{- .Values.externalDatabase.existingSecret -}}
{{- end }}
{{- end }}

{{/*
Return the Redis hostname
*/}}
{{- define "foundry.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" (include "foundry.fullname" .) -}}
{{- else }}
{{- .Values.externalRedis.host -}}
{{- end }}
{{- end }}

{{/*
Return the Redis port
*/}}
{{- define "foundry.redis.port" -}}
{{- if .Values.redis.enabled }}
{{- printf "6379" -}}
{{- else }}
{{- .Values.externalRedis.port | toString -}}
{{- end }}
{{- end }}

{{/*
Return the Redis secret name
*/}}
{{- define "foundry.redis.secretName" -}}
{{- if .Values.redis.enabled }}
{{- .Values.redis.auth.existingSecret -}}
{{- else }}
{{- .Values.externalRedis.existingSecret -}}
{{- end }}
{{- end }}

{{/*
Return the Neo4j hostname
*/}}
{{- define "foundry.neo4j.host" -}}
{{- if .Values.neo4j.enabled }}
{{- printf "%s-neo4j" (include "foundry.fullname" .) -}}
{{- else }}
{{- .Values.externalNeo4j.host -}}
{{- end }}
{{- end }}

{{/*
Return the Neo4j port
*/}}
{{- define "foundry.neo4j.port" -}}
{{- if .Values.neo4j.enabled }}
{{- printf "7687" -}}
{{- else }}
{{- .Values.externalNeo4j.port | toString -}}
{{- end }}
{{- end }}

{{/*
Return the Qdrant hostname
*/}}
{{- define "foundry.qdrant.host" -}}
{{- if .Values.qdrant.enabled }}
{{- printf "%s-qdrant" (include "foundry.fullname" .) -}}
{{- else }}
{{- .Values.externalQdrant.host -}}
{{- end }}
{{- end }}

{{/*
Return the Qdrant port
*/}}
{{- define "foundry.qdrant.port" -}}
{{- if .Values.qdrant.enabled }}
{{- printf "6333" -}}
{{- else }}
{{- .Values.externalQdrant.port | toString -}}
{{- end }}
{{- end }}

{{/*
Create the DATABASE_URL connection string
*/}}
{{- define "foundry.databaseUrl" -}}
{{- $host := include "foundry.postgresql.host" . -}}
{{- $port := include "foundry.postgresql.port" . -}}
{{- $database := include "foundry.postgresql.database" . -}}
{{- $username := include "foundry.postgresql.username" . -}}
{{- printf "postgresql://%s:$(POSTGRES_PASSWORD)@%s:%s/%s?schema=public" $username $host $port $database -}}
{{- end }}

{{/*
Create the REDIS_URL connection string
*/}}
{{- define "foundry.redisUrl" -}}
{{- $host := include "foundry.redis.host" . -}}
{{- $port := include "foundry.redis.port" . -}}
{{- printf "redis://:$(REDIS_PASSWORD)@%s:%s" $host $port -}}
{{- end }}

{{/*
Create the NEO4J_URI connection string
*/}}
{{- define "foundry.neo4jUri" -}}
{{- $host := include "foundry.neo4j.host" . -}}
{{- $port := include "foundry.neo4j.port" . -}}
{{- printf "bolt://%s:%s" $host $port -}}
{{- end }}
