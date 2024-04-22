import {
    ACMClient, 
    DescribeCertificateCommand 
} from '@aws-sdk/client-acm'

import {
    ElasticLoadBalancingV2Client, 
    AddListenerCertificatesCommand,
    DescribeListenersCommand
} from '@aws-sdk/client-elastic-load-balancing-v2'

import {response} from '../utils/response.js'
import { findActiveLoadbalancer } from '../utils/elb.js'

const acmClient = new ACMClient()
const elbClient = new ElasticLoadBalancingV2Client()
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID
export async function handler (event, context ) {
    const id = event.certificateId
    console.log("Checando Status...")

    const certificateArn = `arn:aws:acm:us-east-1:${AWS_ACCOUNT_ID}:certificate/${id}`

    const describeCertificateResponse = await acmClient.send(new DescribeCertificateCommand({
        CertificateArn: certificateArn
    }))

    console.log(describeCertificateResponse)

    const message = 'Certificado ainda não foi validado'
    console.log(describeCertificateResponse.Certificate.DomainValidationOptions)
    return(200, {
            message: message, 
            domainValidationOptions: describeCertificateResponse.Certificate.DomainValidationOptions
        }
    )
}

// const res = await handler({certificateId: "ca931ef5-33e8-4949-af3b-77fce7a6aefe"})

// console.log(res)
