FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libgl1 libglu1-mesa libxi6 libxmu6 libxrender1 libfontconfig1 \
    libgomp1 libstdc++6 gcc g++ make cmake pkg-config \
    libopenblas-dev liblapack-dev python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
