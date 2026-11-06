FROM python:3.12-slim AS wheels
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /src
COPY services/api/requirements-production.lock /src/requirements-production.lock
RUN python -m pip wheel --wheel-dir /wheels -r requirements-production.lock
COPY services/api/ /src/
RUN python -m pip wheel --wheel-dir /wheels --no-deps .

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY --from=wheels /wheels /wheels
COPY services/api/requirements-production.lock /app/requirements-production.lock
RUN python -m pip install --no-index --find-links=/wheels -r requirements-production.lock \
    && python -m pip install --no-index --find-links=/wheels --no-deps nammapros-api \
    && useradd --system --uid 10001 --create-home app \
    && rm -rf /wheels
COPY services/api/ /app/
USER app
EXPOSE 8080
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8080} --workers ${GUNICORN_WORKERS:-2} --threads ${GUNICORN_THREADS:-4} --timeout ${GUNICORN_TIMEOUT:-60} --graceful-timeout 30 --access-logfile - --error-logfile -"]
