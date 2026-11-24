#!/usr/bin/env bash
# Свой VPN (Xray, VLESS + Reality) на чистом сервере Ubuntu/Debian.
# Запуск: curl -fsSL https://raw.githubusercontent.com/baskakovamariia2-ai/dental-base/main/vpn/install.sh | bash
# Повторный запуск ничего не ломает — просто снова покажет ссылку для телефона.
set -e
LINK_FILE=/root/vpn-link.txt
SNI=www.microsoft.com

show() {
  echo
  echo "=================== ГОТОВО ==================="
  echo "QR-код (отсканируйте камерой приложения VPN):"
  qrencode -t ansiutf8 < "$LINK_FILE" || true
  echo
  echo "Ссылка для телефона (скопируйте целиком):"
  echo
  cat "$LINK_FILE"
  echo
  echo "Показать ещё раз:  cat $LINK_FILE"
  echo "=============================================="
}

if [ "$(id -u)" != "0" ]; then echo "Нужно войти как root"; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl openssl qrencode ca-certificates >/dev/null

if [ -s "$LINK_FILE" ] && systemctl is-active --quiet xray; then show; exit 0; fi

echo "Устанавливаю Xray…"
bash -c "$(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install >/dev/null

UUID=$(xray uuid)
KEYS=$(xray x25519)
PRIV=$(echo "$KEYS" | grep -iE '^private' | awk -F': *' '{print $2}' | tr -d ' ')
PUB=$(echo "$KEYS" | grep -iE '^(public key|password)' | awk -F': *' '{print $2}' | tr -d ' ')
SID=$(openssl rand -hex 8)
IP=$(curl -4 -fsS https://ifconfig.me || curl -4 -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
if [ -z "$PRIV" ] || [ -z "$PUB" ] || [ -z "$IP" ]; then echo "Не получилось создать ключи — пришлите этот экран Claude"; echo "$KEYS"; exit 1; fi

cat > /usr/local/etc/xray/config.json <<JSON
{
  "log": { "loglevel": "warning" },
  "inbounds": [{
    "listen": "0.0.0.0", "port": 443, "protocol": "vless",
    "settings": { "clients": [{ "id": "$UUID", "flow": "xtls-rprx-vision" }], "decryption": "none" },
    "streamSettings": {
      "network": "tcp", "security": "reality",
      "realitySettings": { "dest": "$SNI:443", "serverNames": ["$SNI"], "privateKey": "$PRIV", "shortIds": ["$SID"] }
    },
    "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"] }
  }],
  "outbounds": [{ "protocol": "freedom" }]
}
JSON

# ускорение TCP (BBR)
grep -q bbr /etc/sysctl.conf || printf 'net.core.default_qdisc=fq\nnet.ipv4.tcp_congestion_control=bbr\n' >> /etc/sysctl.conf
sysctl -p >/dev/null 2>&1 || true
# если включён файрвол — открыть порт 443
command -v ufw >/dev/null && ufw status | grep -q active && ufw allow 443/tcp >/dev/null || true

systemctl enable xray >/dev/null 2>&1
systemctl restart xray
sleep 1
systemctl is-active --quiet xray || { echo "Xray не запустился — пришлите этот экран Claude"; journalctl -u xray -n 20 --no-pager; exit 1; }

echo "vless://$UUID@$IP:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=$SNI&fp=chrome&pbk=$PUB&sid=$SID&type=tcp#My-VPN" > "$LINK_FILE"
chmod 600 "$LINK_FILE"
show
