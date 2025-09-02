---
title: "The Most Common AD CS Misconfiguations in 2025"
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

