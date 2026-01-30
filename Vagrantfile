# -*- mode: ruby -*-
# vi: set ft=ruby :

# AgentaOS Development VM
# Provides a real Linux environment for testing with Podman

Vagrant.configure("2") do |config|
  config.vm.box = "debian/bookworm64"
  config.vm.hostname = "agentaos-dev"

  # Port forwarding
  # Gateway container binds to 8080 inside VM, forwarded to 8888 on host
  config.vm.network "forwarded_port", guest: 8080, host: 8888
  # API container binds to 3000 (for direct access during dev)
  config.vm.network "forwarded_port", guest: 3000, host: 3033

  # Sync the project directory
  config.vm.synced_folder ".", "/vagrant", type: "virtualbox"

  # VM resources
  config.vm.provider "virtualbox" do |vb|
    vb.name = "agentaos-dev"
    vb.memory = "2048"
    vb.cpus = 2
  end

  # Provisioning script
  config.vm.provision "shell", inline: <<-SHELL
    set -e

    echo "=== Updating system ==="
    apt-get update
    apt-get upgrade -y

    echo "=== Installing dependencies ==="
    apt-get install -y \
      curl \
      wget \
      git \
      build-essential \
      podman \
      fuse-overlayfs \
      slirp4netns \
      uidmap

    echo "=== Installing Node.js 20 ==="
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs

    echo "=== Setting up Podman for rootless ==="
    # Configure subuid/subgid for vagrant user
    echo "vagrant:100000:65536" >> /etc/subuid
    echo "vagrant:100000:65536" >> /etc/subgid

    echo "=== Creating data directories ==="
    mkdir -p /data/documents
    mkdir -p /data/apps
    mkdir -p /data/system
    mkdir -p /run/agentaos
    chown -R vagrant:vagrant /data
    chown -R vagrant:vagrant /run/agentaos

    echo "=== Installing project dependencies ==="
    cd /vagrant
    su - vagrant -c "cd /vagrant && npm install"
    su - vagrant -c "cd /vagrant/core && npm install"
    su - vagrant -c "cd /vagrant/ui && npm install"
    su - vagrant -c "cd /vagrant/init && npm install"

    echo ""
    echo "=== Provisioning complete ==="
    echo ""
    echo "To start AgentaOS:"
    echo "  vagrant ssh"
    echo "  cd /vagrant"
    echo "  ./scripts/build-containers.sh"
    echo "  ./scripts/start-agentaos.sh"
    echo ""
    echo "Then access at: http://localhost:8888"
  SHELL

  # Run on every `vagrant up`
  config.vm.provision "shell", run: "always", inline: <<-SHELL
    # Ensure directories exist and have correct permissions
    mkdir -p /run/agentaos
    chown vagrant:vagrant /run/agentaos
  SHELL
end
