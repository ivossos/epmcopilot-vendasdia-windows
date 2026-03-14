import base64
import httpx
import json

BASE_URL = "https://savegnago-test-gruposavegnago.epm.sa-vinhedo-1.ocs.oraclecloud.com"
USER = "ivossos@gmail.com"
PASS = "Athina303155$"

API_VENDAS = f"{BASE_URL}/HyperionPlanning/rest/v3/applications/Vendas"
token = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
headers = {
    "Authorization": f"Basic {token}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

def main():
    with httpx.Client(verify=True, timeout=30) as client:
        resp = client.get(f"{API_VENDAS}/cubes", headers=headers)
        if resp.status_code == 200:
            print(json.dumps(resp.json(), indent=2))
        else:
            # Try /plantypes if /cubes fails
            resp = client.get(f"{API_VENDAS}/plantypes", headers=headers)
            if resp.status_code == 200:
                print(json.dumps(resp.json(), indent=2))
            else:
                print(f"Error {resp.status_code}: {resp.text}")

if __name__ == "__main__":
    main()
