"""Auto-discover networked thermal printers on the local LAN.

mDNS (zeroconf) catches most modern printers that advertise themselves.
A parallel TCP scan of the local /24 on the raw print port is the fallback
for printers that don't advertise (and to confirm an mDNS hit actually
accepts a JetDirect connection).
"""
import ipaddress
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional


# _pdl-datastream is the standard mDNS advertisement for raw 9100 (JetDirect).
# _printer is LPD and _ipp is IPP -- still worth probing in case the device
# only advertises those even though it accepts ESC/POS on 9100.
_MDNS_SERVICES = (
    "_pdl-datastream._tcp.local.",
    "_printer._tcp.local.",
    "_ipp._tcp.local.",
)


def local_ipv4() -> Optional[str]:
    """Best-effort local IPv4 via a UDP socket -- no packets are actually sent."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 53))
        return sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()


def discover_mdns(timeout: float = 3.0) -> list[dict]:
    """Browse mDNS printer service types for the given window."""
    try:
        from zeroconf import ServiceBrowser, ServiceListener, Zeroconf
    except ImportError:
        return []

    found: list[dict] = []
    seen: set[tuple[str, int]] = set()
    lock = threading.Lock()

    class _Listener(ServiceListener):
        def update_service(self, *_): pass
        def remove_service(self, *_): pass
        def add_service(self, zc, service_type, name):
            info = zc.get_service_info(service_type, name, timeout=2000)
            if not info or not info.addresses:
                return
            for raw in info.addresses:
                if len(raw) != 4:
                    continue
                host = socket.inet_ntoa(raw)
                port = info.port or 9100
                key = (host, port)
                with lock:
                    if key in seen:
                        return
                    seen.add(key)
                    found.append({
                        "host": host,
                        "port": port,
                        "name": name.split(".")[0],
                        "service": service_type.rstrip("."),
                        "method": "mdns",
                    })
                return

    zc = Zeroconf()
    browsers = [ServiceBrowser(zc, st, _Listener()) for st in _MDNS_SERVICES]
    try:
        time.sleep(timeout)
    finally:
        for b in browsers:
            b.cancel()
        zc.close()
    return found


def _probe(host: str, port: int, timeout: float) -> Optional[str]:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return host
    except OSError:
        return None


def discover_scan(port: int = 9100, timeout: float = 0.5) -> list[dict]:
    """Sweep the local /24 for hosts accepting TCP on `port`."""
    local = local_ipv4()
    if not local:
        return []
    network = ipaddress.ip_network(f"{local}/24", strict=False)
    targets = [str(h) for h in network.hosts() if str(h) != local]
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=64) as pool:
        for host in pool.map(lambda h: _probe(h, port, timeout), targets):
            if host:
                results.append({"host": host, "port": port, "method": "scan"})
    return results


def discover_printers(port: int = 9100, mdns_timeout: float = 3.0,
                      scan_timeout: float = 0.5,
                      include_scan: bool = True) -> list[dict]:
    """Return all candidate printers, mDNS first then deduped subnet scan."""
    results = discover_mdns(mdns_timeout)
    if not include_scan:
        return results
    seen = {(r["host"], r["port"]) for r in results}
    for r in discover_scan(port, scan_timeout):
        key = (r["host"], r["port"])
        if key not in seen:
            seen.add(key)
            results.append(r)
    return results
