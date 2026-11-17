FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY scheduling-engine/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY scheduling-engine/engine /app/scheduling-engine/engine
COPY sites/roster/solver-service /app/sites/roster/solver-service
RUN useradd --create-home --uid 10001 solver
USER solver
WORKDIR /app/sites/roster/solver-service
EXPOSE 8080
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--workers","1","--no-access-log"]
