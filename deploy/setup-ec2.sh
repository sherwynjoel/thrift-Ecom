#!/usr/bin/env bash
# One-time bootstrap for a fresh Ubuntu 24.04 EC2 instance. Safe to re-run.
#   sudo bash deploy/setup-ec2.sh
# Installs Docker Engine + the compose plugin, adds a 2 GB swap file, enables the ufw firewall (22, 80, 443),
# turns on unattended security upgrades and caps Docker log sizes.
set -Eeuo pipefail

log() { printf '\033[1m[setup]\033[0m %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash deploy/setup-ec2.sh" >&2; exit 1; }
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || log "WARNING: written for Ubuntu 24.04; this is ${PRETTY_NAME:-unknown}"

export DEBIAN_FRONTEND=noninteractive
log "installing base packages"
apt-get update -y
apt-get install -y ca-certificates curl git gnupg ufw unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine and the compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if [ ! -f /etc/docker/daemon.json ]; then
  log "capping container log size"
  mkdir -p /etc/docker
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "3" }\n}\n' > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker

target_user="${SUDO_USER:-ubuntu}"
if id "$target_user" >/dev/null 2>&1 && ! id -nG "$target_user" | grep -qw docker; then
  usermod -aG docker "$target_user"
  log "added $target_user to the docker group (log out and back in for it to apply)"
fi

if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  log "creating a 2 GB swap file (Next.js builds need it on 2 GB instances)"
  [ -f /swapfile ] || fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -q -p /etc/sysctl.d/99-swappiness.conf

log "configuring the firewall (SSH, HTTP, HTTPS)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

log "enabling automatic security updates"
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades >/dev/null

log "done. Docker $(docker --version | cut -d' ' -f3 | tr -d ,), compose $(docker compose version --short)"
log "next: log out and back in, then: cp deploy/.env.production.example deploy/.env && nano deploy/.env"
