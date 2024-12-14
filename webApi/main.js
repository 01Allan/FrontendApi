document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const API_URL = "https://modeloapi-01.onrender.com/api/predictions/"; // pONE LA API a consumirt
    let jsonData = [];
    let allResults = [];

    const columnMapping = {
        "Last Interaction": "Last_Interaction",
        "Payment Delay": "Payment_Delay",
        "Support Calls": "Support_Calls",
        "Total Spend": "Total_Spend",
        "Usage Frequency": "Usage_Frequency",
        "Contract Length": "Contract_Length",
        "Gender": "Gender",
        "Subscription Type": "Subscription_Type",
        "Tenure": "Tenure",
        "Age": "Age",
        "CustomerID": "CustomerID"
    };

    fileInput.addEventListener('change', handleFileUpload);

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split('\n').filter(line => line.trim() !== '');
            jsonData = convertCSVToJSON(lines);

            if (API_URL.includes("modeloapi-01")) {
                jsonData = jsonData.map(record => mapColumns(record, columnMapping));
                jsonData = jsonData.map(record => formatForMyAPI(record));
            }

            const batchSize = 1500;
            const totalBatches = Math.ceil(jsonData.length / batchSize);

            Swal.fire({
                title: 'Procesando, espere por favor...',
                html: 'Enviando lotes...',
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            sendInBatches(jsonData, batchSize, totalBatches)
                .then(() => {
                    Swal.close();
                    initializeDataTable(allResults);
                    updateCharts(allResults);
                })
                .catch(error => {
                    Swal.close();
                    console.error('Error al procesar los datos:', error);
                });
        };
        reader.readAsText(file);
    }

    function mapColumns(record, mapping) {
        const mappedRecord = {};
        for (const [csvColumn, apiColumn] of Object.entries(mapping)) {
            if (csvColumn in record) {
                mappedRecord[apiColumn] = record[csvColumn];
            }
        }
        return mappedRecord;
    }

    function formatForMyAPI(record) {
        return {
            CustomerID: record.CustomerID,
            Age: parseInt(record.Age, 10),
            Gender: record.Gender,
            Tenure: parseInt(record.Tenure, 10),
            Usage_Frequency: parseFloat(record.Usage_Frequency),
            Support_Calls: parseInt(record.Support_Calls, 10),
            Payment_Delay: parseInt(record.Payment_Delay, 10),
            Subscription_Type: record.Subscription_Type,
            Contract_Length: record.Contract_Length,
            Total_Spend: parseInt(record.Total_Spend, 10),
            Last_Interaction: parseInt(record.Last_Interaction, 10)
        };
    }

    async function sendInBatches(data, batchSize, totalBatches) {
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(batch)
                });

                if (!response.ok) {
                    throw new Error(`Error en la solicitud: ${response.status}`);
                }

                const result = await response.json();
                processAPIResponse(result);

                Swal.update({
                    html: `Lote ${Math.ceil(i / batchSize) + 1} de ${totalBatches} procesado...`
                });
            } catch (error) {
                console.error(`Error al enviar lote ${Math.ceil(i / batchSize) + 1}:`, error);
            }
        }
    }

    function processAPIResponse(apiResponse) {
        if (apiResponse.results) {
            apiResponse.results.forEach(result => {
                const fullRecord = {
                    ...result.data_sent,
                    Churn: result.prediction
                };
            
                fullRecord.Gender = fullRecord.Gender === 0 ? 'Female' : 'Male';
                switch (fullRecord.Contract_Length) {
                    case 0:
                        fullRecord.Contract_Length = 'Monthly'
                        break
                    case 1:
                        fullRecord.Contract_Length = 'Quarterly'
                        break
                    case 2:
                        fullRecord.Contract_Length = 'Annual'
                        break
                }

                switch (fullRecord.Subscription_Type) {
                    case 0:
                        fullRecord.Subscription_Type = 'Basic'
                        break
                    case 1:
                        fullRecord.Subscription_Type = 'Standard'
                        break
                    case 2:
                        fullRecord.Subscription_Type = 'Premium'
                        break
                } 

                allResults.push(fullRecord);
            });
        } else {
            console.error("Respuesta inesperada de la API", apiResponse);
        }
    }

    function convertCSVToJSON(lines) {
        const headers = lines[0].split(',');
        return lines.slice(1).map((line) => {
            const values = line.split(',');
            const entry = {};
            headers.forEach((header, index) => {
                entry[header.trim()] = values[index]?.trim();
            });
            return entry;
        });
    }

    function initializeDataTable(data) {
        $('#dataTable').DataTable({
            data: data,
            columns: Object.keys(data[0]).map(header => ({ title: header, data: header })),
            destroy: true,
            responsive: true,
            paging: true,
            searching: true,
            dom: 'Bfrtip',
            buttons: [
                {
                    extend: 'csv',
                    text: 'Exportar a CSV'
                },
                {
                    extend: 'excel',
                    text: 'Exportar a Excel'
                },
                {
                    extend: 'pdf',
                    text: 'Exportar a PDF'
                }
            ]
        });
    }

    document.getElementById('exportButton').addEventListener('click', exportResultsToCSV);

    function exportResultsToCSV() {
        if (allResults.length === 0) {
            alert('No hay datos para exportar');
            return;
        }

        const headers = Object.keys(allResults[0]);
        const csvRows = [];
        csvRows.push(headers.join(','));

        allResults.forEach(row => {
            const values = headers.map(header => row[header]);
            csvRows.push(values.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', 'results.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // Graficos xd

    let churnPieChart, genderBarChart, subscriptionTypeChart, contractLengthChart, radarChart, subscriptionTypeDonutChart;

    function updateCharts(data) {
        if (!data || data.length === 0) {
            console.error("No hay datos para graficar.");
            return;
        }
    
        const churnedCount = data.filter(item => item.Churn === 1).length;
        const stayedCount = data.length - churnedCount;
    
        const genderCounts = { Male: { churned: 0, stayed: 0 }, Female: { churned: 0, stayed: 0 } };
        const subscriptionCounts = {};
        const contractLengthCounts = {};
    
        data.forEach(item => {
            if (item.Gender in genderCounts) {
                if (item.Churn === 1) genderCounts[item.Gender].churned++;
                else genderCounts[item.Gender].stayed++;
            }
    
            if (!subscriptionCounts[item.Subscription_Type]) {
                subscriptionCounts[item.Subscription_Type] = { churned: 0, stayed: 0 };
            }
            if (item.Churn === 1) subscriptionCounts[item.Subscription_Type].churned++;
            else subscriptionCounts[item.Subscription_Type].stayed++;
    
            if (!contractLengthCounts[item.Contract_Length]) {
                contractLengthCounts[item.Contract_Length] = { churned: 0, stayed: 0 };
            }
            if (item.Churn === 1) contractLengthCounts[item.Contract_Length].churned++;
            else contractLengthCounts[item.Contract_Length].stayed++;
        });
    
        if (churnPieChart) churnPieChart.destroy();
        if (genderBarChart) genderBarChart.destroy();
        if (subscriptionTypeChart) subscriptionTypeChart.destroy();
        if (contractLengthChart) contractLengthChart.destroy();
        // if (lineChart) lineChart.destroy();
        if (radarChart) radarChart.destroy();
        if (subscriptionTypeDonutChart) subscriptionTypeDonutChart.destroy();
    
        // Pie Chart - Distribución de Churn
        const churnPieCtx = document.getElementById('churnPieChart').getContext('2d');
        churnPieChart = new Chart(churnPieCtx, {
            type: 'pie',
            data: {
                labels: ['Continúa activo', 'Canceló'],
                datasets: [{
                    data: [stayedCount, churnedCount],
                    backgroundColor: ['#36a2eb', '#ff6384']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Distribución de Churn' },
                    datalabels: {
                        formatter: (value, context) => {
                            const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
                            const percentage = ((value / total) * 100).toFixed(1) + '%';
                            return percentage; // Muestra el porcentaje
                        },
                        color: '#fff', // Color del texto
                        font: { weight: 'bold' }
                    }
                }
            }
        });
    
        // Bar Chart - Churn por Género
        const genderBarCtx = document.getElementById('genderBarChart').getContext('2d');
        genderBarChart = new Chart(genderBarCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(genderCounts),
                datasets: [
                    {
                        label: 'Continúa activo',
                        data: Object.values(genderCounts).map(g => g.stayed),
                        backgroundColor: '#36a2eb'
                    },
                    {
                        label: 'Canceló',
                        data: Object.values(genderCounts).map(g => g.churned),
                        backgroundColor: '#ff6384'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Churn por Género' },
                    datalabels: {
                        formatter: (value, context) => {
                            const total = context.chart.data.datasets
                                .map(dataset => dataset.data[context.dataIndex])
                                .reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1) + '%';
                            return percentage; // Muestra el porcentaje
                        },
                        color: '#000',
                        font: { weight: 'bold' },
                        anchor: 'end',
                        align: 'top'
                    }
                },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true }
                }
            }
        });
    
        // Bar Chart - Churn por Tipo de Suscripción
        const subscriptionTypeCtx = document.getElementById('subscriptionTypeChart').getContext('2d');
        subscriptionTypeChart = new Chart(subscriptionTypeCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(subscriptionCounts),
                datasets: [
                    {
                        label: 'Continúa activo',
                        data: Object.values(subscriptionCounts).map(s => s.stayed),
                        backgroundColor: '#36a2eb'
                    },
                    {
                        label: 'Canceló',
                        data: Object.values(subscriptionCounts).map(s => s.churned),
                        backgroundColor: '#ff6384'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Churn por Tipo de Suscripción' },
                    datalabels: {
                        formatter: (value, context) => {
                            const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
                            const percentage = ((value / total) * 100).toFixed(1) + '%';
                            return percentage; 
                        },
                        color: '#fff',
                        font: { weight: 'bold' }
                    }
                },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true }
                }
            }
        });
    
        // Doughnut Chart - Distribución por Tipo de Suscripción
        const subscriptionTypeDonutCtx = document.getElementById('subscriptionTypeDonutChart').getContext('2d');
        subscriptionTypeDonutChart = new Chart(subscriptionTypeDonutCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(subscriptionCounts),
                datasets: [{
                    data: Object.values(subscriptionCounts).map(s => s.stayed + s.churned),
                    backgroundColor: ['#36a2eb', '#ff6384', '#ffcd56']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Distribución por Tipo de Suscripción' }
                }
            }
        });
    
        // Bar Chart - Churn por Duración del Contrato
        const contractLengthCtx = document.getElementById('contractLengthChart').getContext('2d');
        contractLengthChart = new Chart(contractLengthCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(contractLengthCounts),
                datasets: [
                    {
                        label: 'Continúa activo',
                        data: Object.values(contractLengthCounts).map(c => c.stayed),
                        backgroundColor: '#36a2eb'
                    },
                    {
                        label: 'Canceló',
                        data: Object.values(contractLengthCounts).map(c => c.churned),
                        backgroundColor: '#ff6384'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Churn por Duración del Contrato' }
                },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true }
                }
            }
        });
    
        // Radar Chart - Comparación de Métricas por Género
        const radarCtx = document.getElementById('radarChart').getContext('2d');
        radarChart = new Chart(radarCtx, {
            type: 'radar',
            data: {
                labels: ['Uso Frecuente', 'Soporte', 'Demora de Pago'],
                datasets: [
                    {
                        label: 'Hombres',
                        data: [genderCounts.Male.stayed, genderCounts.Male.churned],
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        borderColor: '#36a2eb'
                    },
                    {
                        label: 'Mujeres',
                        data: [genderCounts.Female.stayed, genderCounts.Female.churned],
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        borderColor: '#ff6384'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Comparación por Género' }
                }
            }
        });
    
        // Line Chart - Tendencia
        // const lineCtx = document.getElementById('lineChart').getContext('2d');
        // lineChart = new Chart(lineCtx, {
        //     type: 'line',
        //     data: {
        //         labels: data.map(item => item.Last_Interaction),
        //         datasets: [
        //             {
        //                 label: 'Total Spend',
        //                 data: data.map(item => item.Total_Spend),
        //                 borderColor: '#36a2eb',
        //                 fill: false
        //             }
        //         ]
        //     },
        //     options: {
        //         responsive: true,
        //         plugins: {
        //             legend: { position: 'top' },
        //             title: { display: true, text: 'Tendencia de Gastos Totales' }
        //         }
        //     }
        // });
    }
});
