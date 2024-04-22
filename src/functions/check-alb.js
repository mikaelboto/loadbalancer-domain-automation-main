import {
    ElasticLoadBalancingV2Client, 
    CreateLoadBalancerCommand, 
    DescribeListenersCommand,
    CreateListenerCommand,
    CreateTargetGroupCommand,
    RemoveTagsCommand,
    DescribeListenerCertificatesCommand
} from '@aws-sdk/client-elastic-load-balancing-v2'

import { 
    AutoScalingClient, 
    AttachLoadBalancerTargetGroupsCommand 
} from "@aws-sdk/client-auto-scaling"; 

import { 
    SNSClient, 
    PublishCommand 
} from "@aws-sdk/client-sns";

import {
    Route53Client,
    ChangeResourceRecordSetsCommand
} from "@aws-sdk/client-route-53"

import {response} from '../utils/response.js'
import { findActiveLoadbalancer, getLoadbalancerId } from '../utils/elb.js'

const elbClient = new ElasticLoadBalancingV2Client()
const asClient = new AutoScalingClient();
const snsClient = new SNSClient();
const route53Client = new Route53Client();

const MAX_NUMBER_OF_CERTIFICATES = process.env.MAX_NUMBER_OF_CERTIFICATES

const LOAD_BALANCER_NAME = process.env.LOAD_BALANCER_NAME
const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME
const ASG_NAME = process.env.ASG_NAME
const TOPIC_ARN = process.env.TOPIC_ARN
// const SUBNETS = process.env.SUBNETS ?? 'subnet-08ba17a8e0c59b5b3,subnet-0856a01d3f91165b2'
// const SG_ID = process.env.SG_ID ?? 'sg-09deabab2b70aabad'

const VPC_ID = process.env.VPC_ID 
const SUBNETS = process.env.SUBNETS 
const SG_ID = process.env.SG_ID 
const DEFAULT_CERTIFICATE = process.env.DEFAULT_CERTIFICATE

const DEFAULT_DOMAIN = process.env.DEFAULT_DOMAIN
const HOSTED_ZONE_ID = process.env.HOSTED_ZONE_ID

export async function handler (event, context ) {
    try{
        console.log(process.env)

        // ============== FIND LOADBALANCER ==============

        const activeLoadbalancer = await findActiveLoadbalancer(elbClient)

        if(!activeLoadbalancer){
            return response(400, {message: 'Não foi encontrado o Loadbalancer Ativo'})
        }

        // console.log(activeLoadbalancer)

        
        const describeListenersResponse = await elbClient.send(new DescribeListenersCommand({
            LoadBalancerArn: activeLoadbalancer.LoadBalancerArn
        }))

        const listener = describeListenersResponse.Listeners.find(listener => listener.Port === 443)

        console.log(listener)


        const describeCertificatesResponse = await elbClient.send(new DescribeListenerCertificatesCommand({
            ListenerArn: listener.ListenerArn
        }))

        const certificates = describeCertificatesResponse.Certificates

        console.log(certificates)

        if(MAX_NUMBER_OF_CERTIFICATES > certificates.length){
            const message = `O número de certificados (${certificates.length}) é menor que o número máximo configurado (${MAX_NUMBER_OF_CERTIFICATES})`
            console.log(message)
            return response(200, {message: message})
        }

        console.log('Passou do número máximo de Certificados por Listener')


        const timestamp = Date.now().toString()

        console.log('Removendo tag de ativo...')

        const removeTagsResponse = await elbClient.send(new RemoveTagsCommand({
            ResourceArns: [activeLoadbalancer.LoadBalancerArn],
            TagKeys: ['active']
        }))

        // console.log(removeTagsResponse)

        const publishResponse = await snsClient.send(new PublishCommand({
            Message: `Número máximo de Certificados excedido. Realizando a criação de um Loadbalancer.`,
            TopicArn: TOPIC_ARN
        }))


        // console.log(publishResponse)

        console.log('Criando target group...')

        const createTargetGroupResponse = await elbClient.send(new CreateTargetGroupCommand({
            Name: `${TARGET_GROUP_NAME}-${timestamp}`,
            TargetType:'instance',
            HealthCheckEnabled: true,
            HealthCheckIntervalSeconds: 30,
            HealthCheckPath: '/',
            HealthCheckPort: 80,
            HealthCheckProtocol: 'HTTP',
            HealthCheckTimeoutSeconds: 5,
            HealthyThresholdCount:2,
            UnhealthyThresholdCount: 5,
            IpAddressType: 'ipv4',
            Port: 80,
            Protocol:'HTTP',
            VpcId: VPC_ID,
            ProtocolVersion: 'HTTP1',
            Matcher: '200-499',
         
        }))

        // console.log(createTargetGroupResponse)

        console.log('Criando loadbalancer...')

        const createLoadBalancerResponse = await elbClient.send(new CreateLoadBalancerCommand({
            Name: `${LOAD_BALANCER_NAME}-${timestamp}`,
            SecurityGroups: [SG_ID],
            Subnets: SUBNETS.split(','),
            IpAddressType: 'ipv4',
            Scheme: 'internet-facing',
            Type: 'application',
            Tags: [
                {
                    Key: 'active',
                    Value: 'true'
                }
            ]
        }))

        // console.log(createLoadBalancerResponse)


        console.log('Criando listener http...')

        const createListenerResponse1 = await elbClient.send(new CreateListenerCommand({
            LoadBalancerArn: createLoadBalancerResponse.LoadBalancers[0].LoadBalancerArn,
            Port: 80,
            Protocol: 'HTTP',
            DefaultActions: [{
                Type: 'redirect',
                RedirectConfig: {
                    Protocol: 'HTTPS',
                    Port: 443,
                    StatusCode: 'HTTP_301'
                }
            }],
        }))

        // console.log(createListenerResponse1)

        console.log('Criando listener https...')

        const createListenerResponse2 = await elbClient.send(new CreateListenerCommand({
            LoadBalancerArn: createLoadBalancerResponse.LoadBalancers[0].LoadBalancerArn,
            Port: 443,
            Protocol: 'HTTPS',
            DefaultActions: [
                {
                    Type: 'forward',
                    ForwardConfig: {
                        TargetGroups: [
                            {
                                TargetGroupArn: createTargetGroupResponse.TargetGroups[0].TargetGroupArn,
                            }
                        ]
                    }
                }
            ],
            Certificates: [
                {
                    CertificateArn: DEFAULT_CERTIFICATE,
                }
            ]
        }))

        // console.log(createListenerResponse2)

        console.log('Attachando TG no ASG...')

        const attachTargetGroupResponse = await asClient.send(new AttachLoadBalancerTargetGroupsCommand({ 
            AutoScalingGroupName: ASG_NAME,
            TargetGroupARNs: [
                createTargetGroupResponse.TargetGroups[0].TargetGroupArn
            ],
        }));

        // console.log(attachTargetGroupResponse)

        const loadbalancerDNS = createLoadBalancerResponse.LoadBalancers[0].DNSName
        const loadbalancerId = getLoadbalancerId(loadbalancerDNS)

        const recordName = `${loadbalancerId}.${DEFAULT_DOMAIN}`

        console.log('Realizando criação do Record...')

         
        // console.log(createRecordInput.ChangeBatch.Changes)
        const createRecordResponse = await route53Client.send(new ChangeResourceRecordSetsCommand({
            HostedZoneId: HOSTED_ZONE_ID,
            ChangeBatch: {
                Changes: [
                    {
                        Action: 'CREATE',
                        ResourceRecordSet: {
                            Name: recordName,
                            Type: 'CNAME',
                            ResourceRecords: [
                                {
                                    Value:loadbalancerDNS
                                }
                            ],
                            TTL: 60
                        }
                    }
                ]
            }
        }))

        // console.log(createRecordResponse)

        return response(200, {
                message: 'Loadbalancer, target group e listeners criados.',
                loadbalancerArn: createLoadBalancerResponse.LoadBalancers[0].LoadBalancerArn,
                targetGroupArn: createTargetGroupResponse.TargetGroups[0].TargetGroupArn
            }
        )

    }catch(e){
        console.log(e)
        return response(500, {message: e})
    }
}

// const res = await handler()

// console.log(res)
