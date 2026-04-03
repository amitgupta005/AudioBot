FROM python:3.11-slim

WORKDIR /app

COPY alembic.ini /app/
COPY migrations /app/migrations
COPY app /app/app
COPY requirements.txt /app/

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
