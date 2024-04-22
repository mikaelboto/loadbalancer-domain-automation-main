import {
    ACMClient, 
    DescribeCertificateCommand,
    ListTagsForCertificateCommand,
    ListCertificatesCommand,
} from '@aws-sdk/client-acm'

import {
    ElasticLoadBalancingV2Client, 
    AddListenerCertificatesCommand,
    DescribeListenersCommand
} from '@aws-sdk/client-elastic-load-balancing-v2'

import { findActiveLoadbalancer } from '../utils/elb.js'

const acmClient = new ACMClient()
const elbClient = new ElasticLoadBalancingV2Client()

export async function handler (event, context ) {

    const listCertificatesResponse = await acmClient.send(new ListCertificatesCommand({
        CertificateStatuses:['ISSUED'],
        SortBy:'CREATED_AT',
        SortOrder: 'DESCENDING'
    }))

    const certificatesList = listCertificatesResponse.CertificateSummaryList

    for(const cert of certificatesList){

        if(cert.InUse){
            continue
        }
        console.log(`${cert.CertificateArn}`)

        console.log(`Certificado não está em uso`)

        const describeCertificateResponse = await acmClient.send(new DescribeCertificateCommand({
            CertificateArn: cert.CertificateArn
        }))

        // console.log(describeCertificateResponse)

        const isActive = describeCertificateResponse.Certificate.DomainValidationOptions.every(
            d => d.ValidationStatus === 'SUCCESS'
        )
        
        if(!isActive){
            const message = 'Certificado ainda não foi validado'
            console.log(describeCertificateResponse.Certificate.DomainValidationOptions)
            return(200, {
                    message: message, 
                    domainValidationOptions: describeCertificateResponse.Certificate.DomainValidationOptions
                }
            )
        }

        console.log("Certificado foi validado")

        const listTagsForCertificateResponse = await acmClient.send(new ListTagsForCertificateCommand({
            CertificateArn: cert.CertificateArn
        }))

        const automationTag = listTagsForCertificateResponse.Tags.find(
            t => t.Key === 'domain-automation' && t.Value === 'true'
        )
 
        if(!automationTag){
            console.log("Certificado não possuí a tag de automação")
            continue
        }

        console.log("Certificado possuí a tag de automação")

        console.log('Buscando Loadbalancer...')

        const activeLoadbalancer = await findActiveLoadbalancer(elbClient)

        console.log('Buscando Listener...')

        const describeListeners = await elbClient.send(new DescribeListenersCommand({
            LoadBalancerArn: activeLoadbalancer.LoadBalancerArn
        }))

        const httpsListener = describeListeners.Listeners.find(l => l.Protocol === 'HTTPS')

        console.log('Attachando Certificado ao Listener...')

        const attachCertificateResponse = await elbClient.send(new AddListenerCertificatesCommand({
            Certificates: [{
                CertificateArn: cert.CertificateArn
            }],
            ListenerArn: httpsListener.ListenerArn
        }))

        console.log(attachCertificateResponse)

    }
}

// const res = await handler({certificateId: "ca931ef5-33e8-4949-af3b-77fce7a6aefe"})

// console.log(res)
