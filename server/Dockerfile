FROM python:3.12-slim
WORKDIR /opt/rybalka
COPY . /opt/rybalka
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 RECON_DB_PATH=/var/lib/rybalka/recon.sqlite RECON_HOST=0.0.0.0 PORT=8787
RUN useradd --create-home --uid 10001 rybalka && mkdir -p /var/lib/rybalka && chown rybalka:rybalka /var/lib/rybalka
USER rybalka
VOLUME /var/lib/rybalka
EXPOSE 8787
CMD ["python", "server/recon_server.py", "--serve"]
