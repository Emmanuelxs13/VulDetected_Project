FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml README.md ./
COPY scanner ./scanner
RUN pip install --no-cache-dir .

# Run as non-root
RUN useradd -m -u 1000 scanner
USER scanner

# Read-only filesystem enforced by compose/runtime; /tmp should be tmpfs
VOLUME ["/tmp"]

CMD ["celery", "-A", "scanner", "worker", "--loglevel=info", "--concurrency=2"]
