import {
    ACMClient, 
    RequestCertificateCommand, 
    DescribeCertificateCommand
} from '@aws-sdk/client-acm'

import {ElasticLoadBalancingV2Client} from '@aws-sdk/client-elastic-load-balancing-v2'
import {response} from '../utils/response.js'
import { findActiveLoadbalancer, getLoadbalancerId } from '../utils/elb.js'

const elbClient = new ElasticLoadBalancingV2Client()
const acmClient = new ACMClient()

const DELAY = process.env.DELAY
const DEFAULT_DOMAIN = process.env.DEFAULT_DOMAIN

export async function handler (event, context ) {
    const domain = event.domain
    const records = []
    
    if(!domain) {
        return response(400, {message: 'Missing Domain'})
    }

    // ============== REQUEST CERTIFICATE ==============

    console.log("Requisitando Certificado...")
    
    const requestCertificateResponse = await acmClient.send(new RequestCertificateCommand({
        DomainName: domain,
        ValidationMethod: "DNS",
        SubjectAlternativeNames: [
            `*.${domain}`
        ],
        KeyAlgorithm: 'RSA_2048',
        Tags: {
            Key: "domain-automation",
            Value: "true"
        }
    }))

    console.log(requestCertificateResponse)
    
    // ============== FIND LOADBALANCER ==============
  
    const activeLoadbalancer = await findActiveLoadbalancer(elbClient)

    if(!activeLoadbalancer){
        return response(400, {message: 'Não foi encontrado o Loadbalancer Ativo'})
    }
    
    console.log(activeLoadbalancer)

    const loadBalancerId = getLoadbalancerId(activeLoadbalancer.DNSName)

    records.push({
        Name: event.domain, //www.clienteA.com
        Type: 'CNAME',
        Value:`${loadBalancerId}.${DEFAULT_DOMAIN}` // loadbalancer.aws.com
    })


    console.log("Delay...")
    await new Promise((res, rej) => {
        setTimeout(function (){
            res()
        }, DELAY)
    })

    // ============== GET CERTIFICATE RECORDS ==============

    console.log("Buscando Records do Certificado...")

    const describeCertificateCommand = await acmClient.send(new DescribeCertificateCommand({
        CertificateArn: requestCertificateResponse.CertificateArn
    }))

    console.log(describeCertificateCommand)

    const resourceRecords = describeCertificateCommand.Certificate.DomainValidationOptions.map(r => r.ResourceRecord)

    records.push(...resourceRecords)

    const certificateId = describeCertificateCommand.Certificate.CertificateArn.split('/').pop()

    return response(200, {
        certificateId: certificateId,
        records: records
    })
}

// const res = await handler({domain: 'abc.com'})

// console.log(res)
