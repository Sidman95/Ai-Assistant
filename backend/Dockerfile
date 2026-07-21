FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN mkdir -p /data && useradd -m -u 11000 assistant && chown -R assistant /data /srv
USER assistant

CMD ["uvicorn", "app.web.main:app", "--host", "0.0.0.0", "--port", "8000"]
